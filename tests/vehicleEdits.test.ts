import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_COLORS, parseVehicleEdits, statOverrides, vehicleColors } from '../src/engine/vehicleEdits';
import { CAR_CLASS_IDS, carClass, classStats, setStatOverrides } from '../src/engine/driving';

afterEach(() => setStatOverrides({}));

describe('vehicle edits', () => {
  it('keeps known classes, stats and #rrggbb colours, and drops junk', () => {
    const edits = parseVehicleEdits(
      JSON.stringify({
        bus: { topSpeed: 120, grip: 'fast', colors: ['#FF0000', 'red', 42] },
        spaceship: { topSpeed: 999 },
        sedan: { health: -5, nonsense: 1 },
      }),
    );
    expect(edits).toEqual({ bus: { topSpeed: 120, colors: ['#ff0000'] } });
    expect(parseVehicleEdits('not json')).toEqual({});
    expect(parseVehicleEdits(null)).toEqual({});
  });

  it('applies stat edits to the driving rules without touching colours', () => {
    const edits = parseVehicleEdits(JSON.stringify({ bus: { topSpeed: 120, colors: ['#ff0000'] } }));
    expect(statOverrides(edits)).toEqual({ bus: { topSpeed: 120 } });
    setStatOverrides(statOverrides(edits));
    expect(carClass('bus').topSpeed).toBe(120);
    expect(classStats('bus').health).toBe(240);
    expect(carClass('sedan').topSpeed).toBe(180);
  });

  it('gives every class a default palette, overridden by edits', () => {
    for (const id of CAR_CLASS_IDS) expect(DEFAULT_COLORS[id].length).toBeGreaterThan(0);
    expect(vehicleColors('taxi', {})).toEqual(DEFAULT_COLORS.taxi);
    expect(vehicleColors('taxi', { taxi: { colors: ['#000000'] } })).toEqual(['#000000']);
  });
});
