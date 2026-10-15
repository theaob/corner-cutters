import { describe, expect, it } from 'vitest';
import { TEAMS, driverSeats, teamById, teamGrid } from '../src/f1/teams';

/** A repeatable random sequence. */
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const counts = (teams: { id: string }[]) => teams.reduce<Record<string, number>>((m, t) => ((m[t.id] = (m[t.id] ?? 0) + 1), m), {});

describe('teams', () => {
  it('are the eleven, each with its own id and three-letter code, and a livery in #rrggbb', () => {
    expect(TEAMS).toHaveLength(11);
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(11);
    expect(new Set(TEAMS.map((t) => t.code)).size).toBe(11);
    for (const t of TEAMS) {
      expect(t.code).toMatch(/^[A-Z]{3}$/);
      for (const c of [t.body, t.trim, ...(t.accent ? [t.accent] : [])]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(teamById('maas')?.accent).toBeDefined();
    expect(teamById('nobody')).toBeUndefined();
  });

  it('fill a full grid: you in your slot, and every other car from a different team', () => {
    const yours = teamById('frankies-groove')!;
    const grid = teamGrid(yours, 10, 5, seeded(7));
    expect(grid).toHaveLength(10);
    expect(grid[5]).toBe(yours);
    const c = counts(grid);
    expect(Object.keys(c)).toHaveLength(10);
    expect(Object.values(c).every((k) => k === 1)).toBe(true);
  });

  it('seat every car in its team\'s first seat, you too', () => {
    for (const seed of [11, 3, 7]) {
      const grid = teamGrid(TEAMS[2], 10, 5, seeded(seed));
      expect(driverSeats(grid, 5)).toEqual(grid.map(() => 0));
    }
  });

  it('each have two drivers with their own three-letter codes, 22 in all', () => {
    const codes = TEAMS.flatMap((t) => t.drivers);
    expect(codes).toHaveLength(TEAMS.length * 2);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{3}$/);
    expect(new Set(codes).size).toBe(codes.length);
    expect(teamById('milk-energy')?.drivers).toEqual(['VER', 'HAD']);
  });

  it('draw different rivals from race to race', () => {
    const yours = TEAMS[0];
    const fields = new Set(Array.from({ length: 12 }, (_, s) => Object.keys(counts(teamGrid(yours, 10, 5, seeded(s + 1)))).sort().join()));
    expect(fields.size).toBeGreaterThan(3);
  });

  it('start a smaller grid with one car a team', () => {
    const yours = TEAMS[3];
    expect(teamGrid(yours, 1, 0)).toEqual([yours]);
    const four = teamGrid(yours, 4, 2, seeded(3));
    expect(four[2]).toBe(yours);
    expect(Object.values(counts(four))).toEqual([1, 1, 1, 1]);
  });
});
