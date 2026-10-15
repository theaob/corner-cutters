import { describe, expect, it } from 'vitest';
import { cohortRate, mature, rate, type Retention } from '../src/stats/retention';

const r: Retention = {
  today: '2026-10-15',
  cohorts: [
    { day: '2026-09-10', size: 10, d1: 5, d7: 3, d30: 1 },
    { day: '2026-10-01', size: 20, d1: 8, d7: 2, d30: 0 },
    { day: '2026-10-14', size: 4, d1: 0, d7: 0, d30: 0 },
  ],
};

describe('retention', () => {
  it('knows a mark only once a full day after it has passed', () => {
    expect(mature('2026-10-14', 1, r.today)).toBe(false);
    expect(mature('2026-10-13', 1, r.today)).toBe(true);
    expect(mature('2026-10-01', 7, r.today)).toBe(true);
    expect(mature('2026-10-01', 30, r.today)).toBe(false);
  });
  it('rates over the mature cohorts only', () => {
    expect(rate(r, 1)).toEqual({ rate: 13 / 30, back: 13, of: 30 });
    expect(rate(r, 30)).toEqual({ rate: 0.1, back: 1, of: 10 });
  });
  it('has no rate before any cohort is old enough', () => {
    expect(rate({ today: '2026-10-15', cohorts: [r.cohorts[2]] }, 7)).toBeUndefined();
    expect(cohortRate(r.cohorts[2], 1, r.today)).toBeUndefined();
    expect(cohortRate(r.cohorts[0], 7, r.today)).toBeCloseTo(0.3);
  });
});
