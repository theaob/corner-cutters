import { beforeEach, describe, expect, it } from 'vitest';
import { useSave, type SaveStore } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';
import { CHAMPIONSHIP_PRODUCT, PAYWALL, SALE_OFFER, pickOffer, SALE, bought, saleOffered, championshipOpen, circuitsOpen, openShop, ownsChampionship, resetShop, saleOn } from '../src/f1/purchase';

beforeEach(() => {
  const items = new Map<string, string>();
  const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
  useSave(CC_SAVE, store);
  resetShop();
  delete (globalThis as { CdvPurchase?: unknown }).CdvPurchase;
});

describe('the Championship as a purchase', () => {
  it('is open in a build without a store (the web game, the sideloaded app), and in the Google Play build once bought', () => {
    expect(championshipOpen(false, false)).toBe(true);
    expect(championshipOpen(true, false)).toBe(false);
    expect(championshipOpen(true, true)).toBe(true);
    // (these tests run as a build without a store)
    expect(PAYWALL).toBe(false);
    expect(ownsChampionship()).toBe(true);
  });

  it('without it, opens the first circuit only; with it, the circuits the Championship has reached', () => {
    const reached = new Set(['crescent-park', 'silver-heath', 'harbour']);
    expect([...circuitsOpen(false, 'crescent-park', reached)]).toEqual(['crescent-park']);
    expect(circuitsOpen(true, 'crescent-park', reached)).toEqual(reached);
  });

  it('opens the free circuits either way', () => {
    const reached = new Set(['crescent-park', 'silver-heath']);
    expect([...circuitsOpen(false, 'crescent-park', reached, ['glacier-pass'])]).toEqual(['crescent-park', 'glacier-pass']);
    expect(circuitsOpen(true, 'crescent-park', reached, ['glacier-pass'])).toEqual(new Set([...reached, 'glacier-pass']));
  });
});

/** A stand-in for Google Play's store (the plugin's CdvPurchase): one product, bought or not. */
function fakePlay(o: { owned?: boolean; price?: string; offers?: unknown[]; ordered?: unknown[] } = {}) {
  let owned = !!o.owned;
  const on: Record<string, ((x: unknown) => void)[]> = { approved: [], finished: [], productUpdated: [] };
  const product = {
    id: CHAMPIONSHIP_PRODUCT,
    pricing: { price: o.price ?? '€2.99' },
    offers: o.offers,
    canPurchase: true,
    get owned() {
      return owned;
    },
    getOffer: () => ({
      id: CHAMPIONSHIP_PRODUCT,
      order: async () => {
        o.ordered?.push(CHAMPIONSHIP_PRODUCT);
        const t = { products: [{ id: CHAMPIONSHIP_PRODUCT }], finish: () => ((owned = true), on.finished.forEach((f) => f(t))) };
        on.approved.forEach((f) => f(t));
        return undefined;
      },
    }),
  };
  const when = {
    approved: (f: (x: unknown) => void) => (on.approved.push(f), when),
    finished: (f: (x: unknown) => void) => (on.finished.push(f), when),
    productUpdated: (f: (x: unknown) => void) => (on.productUpdated.push(f), when),
  };
  const store = {
    register: () => {},
    when: () => when,
    error: () => {},
    initialize: async () => {
      on.productUpdated.forEach((f) => f(product));
      return [];
    },
    get: () => product,
    owned: () => owned,
    restorePurchases: async () => {},
  };
  (globalThis as { CdvPurchase?: unknown }).CdvPurchase = { store, ProductType: { NON_CONSUMABLE: 'non consumable' }, Platform: { GOOGLE_PLAY: 'android-playstore' }, ErrorCode: { PAYMENT_CANCELLED: 6777006 } };
}

describe('the shop (Google Play)', () => {
  it('shows the price from Google Play, and a purchase makes it yours, kept in the save', async () => {
    fakePlay({ price: '€2.99' });
    const shop = openShop();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(shop.state()).toMatchObject({ ready: true, price: '€2.99' });
    expect(bought()).toBe(false);
    expect(await shop.buy()).toBe(true);
    expect(bought()).toBe(true);
  });

  it('gives back a purchase made on another install', async () => {
    fakePlay({ owned: true });
    const shop = openShop();
    expect(await shop.restore()).toBe(true);
    expect(bought()).toBe(true);
  });

  it("says why when Google Play can't be reached, and when the Championship isn't on sale there", async () => {
    type Play = { store: { initialize: () => Promise<unknown[]>; get: () => unknown } };
    const play = () => (globalThis as { CdvPurchase?: Play }).CdvPurchase!;
    fakePlay();
    play().store.initialize = async () => [{ code: 6777001, message: 'Init failed - BILLING_UNAVAILABLE' }];
    const shop = openShop();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(shop.state().error).toBe('GOOGLE PLAY ISN’T AVAILABLE HERE (INIT FAILED - BILLING_UNAVAILABLE)');

    resetShop();
    fakePlay();
    // (Google Play reached, but no product with the Championship's id)
    play().store.get = () => undefined;
    const empty = openShop();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(empty.state().error).toBe('THE CHAMPIONSHIP ISN’T ON SALE ON GOOGLE PLAY YET');
  });

  it('takes the Championship back when Google Play no longer lists it (a refund)', async () => {
    fakePlay();
    const shop = openShop();
    expect(await shop.buy()).toBe(true);
    expect(bought()).toBe(true);
    // (refunded: the next start finds it saved here, but not owned in the store)
    resetShop();
    fakePlay();
    openShop();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(bought()).toBe(false);
  });

  it('keeps it when Google Play cannot be reached (offline is no refund)', async () => {
    fakePlay({ owned: true });
    await openShop().restore();
    resetShop();
    fakePlay();
    type Play = { store: { initialize: () => Promise<unknown[]> } };
    (globalThis as { CdvPurchase?: Play }).CdvPurchase!.store.initialize = async () => [{ code: 6777001, message: 'BILLING_UNAVAILABLE' }];
    openShop();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(bought()).toBe(true);
  });

  it("finds nothing to restore when it wasn't bought", async () => {
    fakePlay();
    const shop = openShop();
    expect(await shop.restore()).toBe(false);
    expect(bought()).toBe(false);
  });
});

const phase = (price: string, priceMicros: number) => [{ price, priceMicros }];
const full = { id: CHAMPIONSHIP_PRODUCT, pricingPhases: phase('€2.99', 2990000) };
const sale = { id: `${CHAMPIONSHIP_PRODUCT}@${SALE_OFFER}`, pricingPhases: phase('€0.29', 290000) };

describe('the sale offer', () => {
  it('picks the sale offer by id, with the full price to strike through', () => {
    expect(pickOffer([full, sale])).toMatchObject({ offer: sale, price: '€0.29', list: '€2.99' });
    expect(pickOffer([sale, full]).offer).toBe(sale);
  });
  it('falls back to the cheapest offer when the id is not there', () => {
    const other = { id: `${CHAMPIONSHIP_PRODUCT}@other`, pricingPhases: phase('€0.99', 990000) };
    expect(pickOffer([full, other])).toMatchObject({ offer: other, price: '€0.99', list: '€2.99' });
  });
  it('has no list price when there is a single offer', () => {
    expect(pickOffer([full])).toEqual({ offer: full, price: '€2.99', list: undefined });
    expect(pickOffer([]).offer).toBeUndefined();
  });
  it('shows the discounted price and buys with the discount offer', async () => {
    const orders: string[] = [];
    const offers = [full, sale].map((x) => ({ ...x, order: async () => (orders.push(x.id), undefined) }));
    fakePlay({ offers });
    const shop = openShop();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(shop.state()).toMatchObject({ price: '€0.29', list: '€2.99' });
    void shop.buy();
    await new Promise((r) => setTimeout(r, 0));
    expect(orders).toEqual([sale.id]);
  });
});

describe('the sale', () => {
  it('runs from 15 November 2026 to the new year, in a store build only', () => {
    expect(saleOn(SALE.from - 1, true)).toBe(false);
    expect(saleOn(SALE.from, true)).toBe(true);
    expect(saleOn(Date.UTC(2026, 11, 31, 23, 59), true)).toBe(true);
    expect(saleOn(SALE.until, true)).toBe(false);
    expect(saleOn(SALE.from, false)).toBe(false);
    expect(new Date(SALE.from).toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(new Date(SALE.until).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
  it('is not offered in a build without a store', () => {
    expect(saleOffered()).toBe(false);
  });
});
