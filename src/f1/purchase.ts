// The Championship as an in-app purchase, in the Google Play build of the app
// (built with VITE_STORE=play) and the App Store build (VITE_STORE=appstore):
// the game is free, with Crescent Park open in every mode; the Championship,
// and with it every other circuit (reached in a Championship, as before), is a
// one-time purchase through the store (cordova-plugin-purchase). Bought once,
// it's kept in the save, and restored from the store on a new install. Every
// other build (the web game, and the Android app sideloaded from itch.io) has
// no store: everything is open, as before.

import { save, saved } from '../engine/save';

/** The product in the Play Console and App Store Connect: a one-time ("managed" / non-consumable) product with this id. */
export const CHAMPIONSHIP_PRODUCT = 'championship';

/** Whether this build is the App Store's (the iOS app) rather than Google Play's. */
const APPLE: boolean = import.meta.env.VITE_STORE === 'appstore';

/** Whether this build sells the Championship (the Google Play and App Store builds). */
export const PAYWALL: boolean = import.meta.env.VITE_STORE === 'play' || APPLE;

/** The store's name as the shop shows it. */
export const STORE_NAME: string = APPLE ? 'THE APP STORE' : 'GOOGLE PLAY';

/** Whether the Championship is open: in a build without a store, always; else once bought. */
export const championshipOpen = (paywall: boolean, bought: boolean): boolean => !paywall || bought;

/** Whether the Championship has been bought (as saved on this device). */
export const bought = (): boolean => saved('progress', 'championship') === true;

/** Whether the Championship is open in this build, now. */
export const ownsChampionship = (): boolean => championshipOpen(PAYWALL, bought());

/**
 * The circuits open for a Quick Race, a Time Attack or a Time Trial, given what's open with the Championship
 * (`unlocked`: as the Championship has reached them): without it, the first circuit only; the `free` ones either way.
 */
export const circuitsOpen = (owned: boolean, first: string, unlocked: ReadonlySet<string>, free: string[] = []): Set<string> => new Set([...(owned ? unlocked : [first]), ...free]);

/** What the store says about the Championship. */
export interface ShopState {
  /** the store is up (the store reached, the product found) */
  ready: boolean;
  /** its price, as the store shows it (in the player's currency) */
  price?: string;
  /** why it can't be bought (no store: an app not installed from it, or offline) */
  error?: string;
}

export interface Shop {
  state(): ShopState;
  /** buy it: resolves once the store is done (true: it's yours) */
  buy(): Promise<boolean>;
  /** restore a purchase made before (on another install): true if it's yours */
  restore(): Promise<boolean>;
  /** told whenever the state changes (the price arrives, or it's bought) */
  onChange(f: () => void): void;
}

/** Mark the Championship bought on this device. */
function grant(): void {
  save('progress', 'championship', true);
}

/** The plugin's name for this build's store. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STORE_PLATFORM = (Platform: any): string => (APPLE ? Platform.APPLE_APPSTORE : Platform.GOOGLE_PLAY);

// the plugin's global, once the app's native side is up (types loose: it's only there in the apps)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cdv = any;
const cdv = (): Cdv | undefined => (globalThis as { CdvPurchase?: Cdv }).CdvPurchase;

/** The plugin, once it's loaded (it comes with the app's native side, a moment after the page). */
function waitForStore(ms = 10000): Promise<Cdv | undefined> {
  return new Promise((resolve) => {
    if (cdv()) return resolve(cdv());
    const t0 = Date.now();
    const tick = () => {
      if (cdv()) resolve(cdv());
      else if (Date.now() - t0 > ms) resolve(undefined);
      else setTimeout(tick, 100);
    };
    tick();
  });
}

let shop: Shop | undefined;

/** Why the store can't be reached, with its own reason under it (so a player's report says which it is). */
export const unavailable = (why: unknown): string => {
  const reason = String(why ?? '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 120);
  return reason ? `${STORE_NAME} ISN’T AVAILABLE HERE (${reason})` : `${STORE_NAME} ISN’T AVAILABLE HERE`;
};

/** The shop (set up once): the platform's store, with the Championship registered and its purchase listened for. */
export function openShop(): Shop {
  if (shop) return shop;
  const st: ShopState = { ready: false };
  const listeners: (() => void)[] = [];
  const changed = () => listeners.forEach((f) => f());
  let waiting: ((ok: boolean) => void) | undefined;
  const owned = () => {
    grant();
    st.ready = true;
    changed();
    waiting?.(true);
    waiting = undefined;
  };
  const ready = waitForStore().then(async (C) => {
    if (!C) {
      st.error = unavailable('NO STORE IN THIS BUILD');
      changed();
      return undefined;
    }
    const { store, ProductType, Platform } = C;
    store.register([{ id: CHAMPIONSHIP_PRODUCT, type: ProductType.NON_CONSUMABLE, platform: STORE_PLATFORM(Platform) }]);
    store
      .when()
      .approved((t: Cdv) => t.finish())
      .finished((t: Cdv) => {
        if (t.products?.some((p: Cdv) => p.id === CHAMPIONSHIP_PRODUCT)) owned();
      })
      .productUpdated(() => {
        const p = store.get(CHAMPIONSHIP_PRODUCT, STORE_PLATFORM(Platform));
        st.price = p?.pricing?.price;
        st.ready = !!p?.canPurchase || !!p?.owned;
        if (p?.owned) owned();
        changed();
      });
    store.error((e: Cdv) => {
      // (a purchase the player backed out of is no error to show)
      if (e?.code !== C.ErrorCode?.PAYMENT_CANCELLED) st.error = `${STORE_NAME}: ` + String(e?.message ?? 'ERROR').toUpperCase();
      waiting?.(false);
      waiting = undefined;
      changed();
    });
    const errors: Cdv[] | undefined = await store.initialize([STORE_PLATFORM(Platform)]);
    if (errors?.length) st.error = unavailable(errors.map((e) => e?.message ?? e?.code).join(' · '));
    if (store.owned(CHAMPIONSHIP_PRODUCT)) owned();
    // (the store reached, but no Championship there to sell: the product's not made, or not active, in its console)
    else if (!st.error && !st.price) st.error = `THE CHAMPIONSHIP ISN’T ON SALE ON ${STORE_NAME} YET`;
    changed();
    return store;
  });
  shop = {
    state: () => st,
    onChange: (f) => listeners.push(f),
    async buy() {
      const store = await ready;
      const offer = store?.get(CHAMPIONSHIP_PRODUCT)?.getOffer();
      if (!offer) return false;
      const done = new Promise<boolean>((resolve) => (waiting = resolve));
      const err = await offer.order();
      if (err) {
        waiting = undefined;
        return false;
      }
      return done;
    },
    async restore() {
      const store = await ready;
      if (!store) return false;
      await store.restorePurchases();
      if (store.owned(CHAMPIONSHIP_PRODUCT)) owned();
      return bought();
    },
  };
  return shop;
}

/** Forget the shop set up (for tests: the next openShop() sets up afresh). */
export function resetShop(): void {
  shop = undefined;
}
