import { describe, expect, it } from 'vitest';
import { CAR_STYLES, shopStyles, stylesFor } from '../src/f1/carStyle';
import { REWARDS } from '../src/f1/streak';

describe('the shop', () => {
  it('lists every look: STANDARD (white helmet) and the golden helmet always yours, the streak looks locked', () => {
    const all = shopStyles(0);
    expect(all.map((e) => e.style.id)).toEqual(CAR_STYLES.map((s) => s.id));
    expect(all[0]).toMatchObject({ owned: true });
    expect(CAR_STYLES[0].look.helmet).toBeUndefined();
    expect(all[1].style).toMatchObject({ id: 'golden-helmet', look: { helmet: 'gold' } });
    expect(all[1].owned).toBe(true);
    expect(all.slice(2).every((e) => !e.owned)).toBe(true);
  });

  it('opens each look at its streak, and owns what stylesFor offers', () => {
    for (const best of [0, 3, 7, 14, 30]) {
      const owned = shopStyles(best).filter((e) => e.owned).map((e) => e.style.id);
      expect(owned).toEqual(stylesFor(best).map((s) => s.id));
    }
    expect(shopStyles(7).filter((e) => e.owned).map((e) => e.style.id)).toEqual(['standard', 'golden-helmet', 'silver-helmet', 'neon-helmet']);
    expect(shopStyles(30).every((e) => e.owned)).toBe(true);
    expect(CAR_STYLES.length).toBe(REWARDS.length + 2);
  });
});
