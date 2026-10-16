import { describe, expect, it } from 'vitest';
import { FREE_LAYOUTS, LAYOUTS } from '../src/f1/layouts';
import { flagMarkup, hasFlag } from '../src/f1/flags';

describe('circuit flags', () => {
  it('every country a circuit names has a flag', () => {
    for (const l of [...LAYOUTS, ...FREE_LAYOUTS]) if (l.country) expect(hasFlag(l.country), l.id).toBe(true);
  });
  it('the real-world circuits have a country, the circuits of our own none', () => {
    const ours = ['glacier-pass', 'dust-bowl', 'volcano-isle'];
    for (const l of [...LAYOUTS, ...FREE_LAYOUTS]) expect(!!l.country, l.id).toBe(!ours.includes(l.id));
  });
  it('draws something for a known country, nothing for an unknown one', () => {
    expect(flagMarkup('GB')).toContain('<rect');
    expect(flagMarkup(undefined)).toBeUndefined();
    expect(flagMarkup('XX')).toBeUndefined();
  });
});
