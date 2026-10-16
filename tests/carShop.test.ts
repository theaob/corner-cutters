import { describe, expect, it } from 'vitest';
import { CAR_STYLES, shopStyles, stylesFor } from '../src/f1/carStyle';
import { REWARDS } from '../src/f1/streak';

describe('the shop', () => {
  it('lists every look: NO CUSTOMIZATION (white helmet) always yours, the streak looks locked', () => {
    const all = shopStyles(0);
    expect(all.map((e) => e.style.id)).toEqual(CAR_STYLES.map((s) => s.id));
    expect(all[0]).toMatchObject({ owned: true });
    expect(CAR_STYLES[0].look.helmet).toBeUndefined();
    expect(all.slice(1).every((e) => !e.owned)).toBe(true);
    // (the golden helmet is earned, by a 21-day streak)
    const gold = CAR_STYLES.find((s) => s.id === 'golden-helmet')!;
    expect(gold).toMatchObject({ days: 21, look: { helmet: 'gold' } });
  });

  it('opens each look at its streak, and owns what stylesFor offers', () => {
    for (const best of [0, 3, 7, 14, 21, 30, 45, 60, 90, 120]) {
      const owned = shopStyles(best).filter((e) => e.owned).map((e) => e.style.id);
      expect(owned).toEqual(stylesFor(best).map((s) => s.id));
    }
    expect(shopStyles(7).filter((e) => e.owned).map((e) => e.style.id)).toEqual(['standard', 'silver-helmet', 'neon-helmet']);
    expect(shopStyles(21).filter((e) => e.owned).map((e) => e.style.id)).toContain('golden-helmet');
    expect(shopStyles(30).find((e) => e.style.id === 'led-helmet')?.owned).toBe(false);
    expect(shopStyles(120).every((e) => e.owned)).toBe(true);
    expect(CAR_STYLES.find((s) => s.id === 'led-helmet')).toMatchObject({ days: 45, look: { helmet: 'led' } });
    expect(shopStyles(45).find((e) => e.style.id === 'night-racer')?.owned).toBe(false);
    expect(CAR_STYLES.find((s) => s.id === 'chequered')).toMatchObject({ days: 120, look: { pattern: 'band' } });
    expect(CAR_STYLES.length).toBe(REWARDS.length + 1);
  });
});

describe('settings', () => {
  it('has no CAR STYLE row any more: the look is chosen in the shop', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/f1/settingsRows.ts', 'utf8')).not.toContain('CAR STYLE');
  });
});
