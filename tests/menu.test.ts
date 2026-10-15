import { describe, expect, it } from 'vitest';
import { MODES, openFirst, rowsOf } from '../src/f1/circuitSelect';
import { gridStep } from '../src/f1/menuTiles';
import { versionText } from '../src/f1/settingsRows';
import { DUST_BOWL, GLACIER_PASS } from '../src/f1/layouts';

describe('the menu', () => {
  it('starts with the modes: the Daily Challenge, Quick Race, Championship, Time Attack and Time Trial', () => {
    expect(MODES.map((m) => m.name)).toEqual(['DAILY CHALLENGE', 'QUICK RACE', 'CHAMPIONSHIP', 'TIME ATTACK', 'TIME TRIAL']);
  });

  it("then shows each mode's own options with the circuit: a Quick Race's qualifying and laps, the time modes' team and weather", () => {
    expect(rowsOf('race')).toEqual(['team', 'car', 'weather', 'qualifying', 'laps', 'tyres']);
    expect(rowsOf('timeattack')).toEqual(['team', 'car', 'weather']);
    // (on dirt, no TYRES: off-road tyres are the only ones)
    expect(rowsOf('race', DUST_BOWL)).toEqual(['team', 'car', 'weather', 'qualifying', 'laps']);
    expect(rowsOf('race', GLACIER_PASS)).toContain('tyres');
    expect(rowsOf('timetrial')).toEqual(['team', 'car', 'weather']);
    // (the Daily Challenge too: the day's circuit and weather are everyone's)
    expect(rowsOf('daily')).toEqual([]);
    // (a Championship has its own screen: a season races every circuit)
    expect(rowsOf('championship')).toEqual([]);
  });
});

describe('the circuit screen', () => {
  it('has the open circuits first, then the locked ones, each in calendar order', () => {
    const calendar = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    expect(openFirst(calendar, new Set(['b', 'e'])).map((l) => l.id)).toEqual(['b', 'e', 'a', 'c', 'd']);
    // (all open, or none: as the calendar)
    expect(openFirst(calendar, new Set(['a', 'b', 'c', 'd', 'e'])).map((l) => l.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(openFirst(calendar, new Set()).map((l) => l.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('the version under the settings', () => {
  it('says the release and the build (the commit)', () => {
    expect(versionText('0.0.1+2790585')).toBe('VERSION 0.0.1 · BUILD 2790585');
    expect(versionText('1.2.0')).toBe('VERSION 1.2.0');
    expect(versionText('0.0.1+local')).toBe('VERSION 0.0.1 · BUILD LOCAL');
  });
});

describe('the tile grid', () => {
  // seven tiles, three to a row: the five modes, SETTINGS, TROPHIES (the last row's one tile)
  const step = (at: number, dx: number, dy: number) => gridStep(at, dx, dy, 7);
  it('moves left and right to the neighbour, wrapping at the ends', () => {
    expect(step(0, 1, 0)).toBe(1);
    expect(step(2, 1, 0)).toBe(3);
    expect(step(6, 1, 0)).toBe(0);
    expect(step(0, -1, 0)).toBe(6);
  });
  it('moves up and down a row, wrapping within the column', () => {
    expect(step(0, 0, 1)).toBe(3);
    expect(step(3, 0, 1)).toBe(6);
    // (down from the last row, or off a short one: the top of the column; up from the top: the column's last tile)
    expect(step(6, 0, 1)).toBe(0);
    expect(step(4, 0, 1)).toBe(1);
    expect(step(0, 0, -1)).toBe(6);
    expect(step(1, 0, -1)).toBe(4);
    expect(step(2, 0, -1)).toBe(5);
  });
  it('starts at the first tile (up or left: the last) when none is highlighted', () => {
    expect(step(-1, 0, 1)).toBe(0);
    expect(step(-1, 1, 0)).toBe(0);
    expect(step(-1, 0, -1)).toBe(6);
  });
});
