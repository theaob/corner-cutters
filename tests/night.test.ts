import { describe, expect, it } from 'vitest';
import { buildCircuit } from '../src/f1/circuit';
import { HALF_WIDTH, RUNOFF } from '../src/f1/circuit';
import { LAYOUTS } from '../src/f1/layouts';
import { carClass } from '../src/engine/driving';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { FLOODLIGHT, floodlights, nightSky, timeById } from '../src/f1/night';
import { WEATHERS } from '../src/f1/weather';

const f1 = carClass('f1');

describe('night races', () => {
  it('are dark, lit from high overhead, a little dimmer in the rain', () => {
    const [dry, , wet] = WEATHERS;
    const night = nightSky(dry);
    expect(night.moon).toBe(true);
    expect(night.background).toBeLessThan(dry.sky.background);
    expect(night.keyOffset.y).toBeGreaterThan(Math.hypot(night.keyOffset.x, night.keyOffset.z) * 3);
    expect(nightSky(wet).keyIntensity).toBeLessThan(night.keyIntensity);
  });

  it('are picked by id (day unless night)', () => {
    expect(timeById('night')).toBe('night');
    expect(timeById(null)).toBe('day');
    expect(timeById('dusk')).toBe('day');
  });

  it.each(LAYOUTS)('have floodlight towers round $name, off the track and its run-off', (layout) => {
    const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const clear = HALF_WIDTH + RUNOFF;
    const towers = floodlights(c.track, clear);
    // most of the way round (a few skipped where the track doubles back)
    expect(towers.length).toBeGreaterThan((0.5 * c.track.length) / FLOODLIGHT.every);
    for (const t of towers) for (const s of c.track.samples) expect(Math.hypot(s.x - t.x, s.y - t.y)).toBeGreaterThanOrEqual(clear - c.track.spacing * 2);
  });
});
