import { describe, expect, it } from 'vitest';
import { TEAMS, TEAMS_PER_RACE, teamById, teamGrid } from '../src/f1/teams';

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

  it('fill a full grid: you in your slot, your teammate elsewhere, five teams of two', () => {
    const yours = teamById('frankies-groove')!;
    const grid = teamGrid(yours, 10, 5, seeded(7));
    expect(grid).toHaveLength(10);
    expect(grid[5]).toBe(yours);
    const c = counts(grid);
    expect(Object.keys(c)).toHaveLength(TEAMS_PER_RACE);
    expect(Object.values(c).every((k) => k === 2)).toBe(true);
    expect(c[yours.id]).toBe(2);
  });

  it('draw different rivals from race to race', () => {
    const yours = TEAMS[0];
    const fields = new Set(Array.from({ length: 12 }, (_, s) => Object.keys(counts(teamGrid(yours, 10, 5, seeded(s + 1)))).sort().join()));
    expect(fields.size).toBeGreaterThan(3);
  });

  it('pair up on a smaller grid, your teammate first', () => {
    const yours = TEAMS[3];
    expect(teamGrid(yours, 1, 0)).toEqual([yours]);
    const four = teamGrid(yours, 4, 2, seeded(3));
    const c = counts(four);
    expect(c[yours.id]).toBe(2);
    // four cars: you, your teammate, and one rival team's pair
    expect(Object.values(c)).toEqual([2, 2]);
  });
});
