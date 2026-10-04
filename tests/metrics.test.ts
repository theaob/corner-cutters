import { describe, expect, it } from 'vitest';
import { online } from '../src/engine/backend';
import { METRES_PER_PX, flush, kmOf, track } from '../src/f1/metrics';
import { INITIALS } from '../src/f1/profile';

describe('the play stats', () => {
  it('a lap of Silver Heath (8,800 px) is about the 5.9 km of the circuit it is traced from', () => {
    expect(kmOf(8800)).toBeCloseTo(5.9, 1);
    expect(METRES_PER_PX).toBeGreaterThan(0);
  });

  it('without a backend in the build, nothing is queued or sent (the game plays offline)', () => {
    expect(online()).toBe(false);
    let fetched = 0;
    const was = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetched++;
      return new Response('');
    }) as typeof fetch;
    try {
      track('launch');
      track('drive', { km: 1.2 });
      flush(true);
    } finally {
      globalThis.fetch = was;
    }
    expect(fetched).toBe(0);
  });

  it("the board's initials: three letters or digits", () => {
    expect(INITIALS.test('ABC')).toBe(true);
    expect(INITIALS.test('A1Z')).toBe(true);
    expect(INITIALS.test('ab')).toBe(false);
    expect(INITIALS.test('ABCD')).toBe(false);
  });
});
