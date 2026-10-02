import { describe, expect, it } from 'vitest';
import { MODES, rowsOf } from '../src/f1/circuitSelect';

describe('the menu', () => {
  it('starts with the modes: Quick Race, Championship, Time Attack and Time Trial', () => {
    expect(MODES.map((m) => m.name)).toEqual(['QUICK RACE', 'CHAMPIONSHIP', 'TIME ATTACK', 'TIME TRIAL']);
  });

  it("then shows each mode's own options with the circuit: a Quick Race's qualifying and laps, the time modes' team and weather", () => {
    expect(rowsOf('race')).toEqual(['team', 'car', 'weather', 'qualifying', 'laps']);
    expect(rowsOf('timeattack')).toEqual(['team', 'car', 'weather']);
    expect(rowsOf('timetrial')).toEqual(['team', 'car', 'weather']);
    // (a Championship has its own screen: a season races every circuit)
    expect(rowsOf('championship')).toEqual([]);
  });
});
