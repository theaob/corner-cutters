import { describe, expect, it } from 'vitest';
import { carClass, newCar } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { NORMAL, aiPaceFor, handlingFor } from '../src/f1/difficulty';
import { ARDENNES, SILVER_HEATH } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { newRace, stepRace, type RaceEvent } from '../src/f1/raceControl';
import { COMPOUNDS, tyreFor, type Compound } from '../src/f1/tyres';
import { WEATHERS } from '../src/f1/weather';

const f1 = carClass('f1');
const compounds = Object.keys(COMPOUNDS) as Compound[];

describe('weather and tyres', () => {
  it.each(WEATHERS)('fit the quickest compound in the $name: slicks dry, intermediates damp, full wets wet', (w) => {
    const best = tyreFor(w.id);
    expect(best).toBe({ dry: 'slick', damp: 'inter', wet: 'wet' }[w.id]);
    for (const c of compounds.filter((c) => c !== best)) {
      expect(COMPOUNDS[c].on[w.id].speed).toBeLessThan(COMPOUNDS[best].on[w.id].speed);
      expect(COMPOUNDS[c].on[w.id].grip).toBeLessThan(COMPOUNDS[best].on[w.id].grip);
    }
  });

  it('make a wet track slower than a dry one, even on the right tyres, and wear wet tyres out fast in the dry', () => {
    const on = (w: 'dry' | 'damp' | 'wet') => COMPOUNDS[tyreFor(w)].on[w];
    expect(on('damp').speed).toBeLessThan(on('dry').speed);
    expect(on('wet').speed).toBeLessThan(on('damp').speed);
    expect(COMPOUNDS.wet.on.dry.wear).toBeGreaterThan(3);
  });

  // (one race in each: the dry races in tyres.test.ts stop on every circuit)
  it.each([
    { layout: SILVER_HEATH, weather: 'damp' as const, name: 'Silver Heath, damp' },
    { layout: ARDENNES, weather: 'wet' as const, name: 'Ardennes, wet' },
  ])(
    'runs a clean 5-lap race at $name: everyone on the right tyres, one stop each (at most one, on a circuit easy on tyres), all finish',
    ({ layout, weather }) => {
      const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
      const field = c.slots.slice(0, 10).map((s, i) => ({ car: newCar(f1, s.x, s.y, s.heading), ai: { lane: ((i * 7) % 11) - 5, pace: aiPaceFor(NORMAL, i, 10) }, box: i >> 1 }));
      const race = newRace(c.track, c.grid, handlingFor(NORMAL), 5, field, 0.5, c.pit, weather);
      expect(race.entrants.every((e) => e.tyres.compound === tyreFor(weather))).toBe(true);
      const events: RaceEvent[] = [];
      for (let t = 0; t < 500 && !race.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired); t += 1 / 60) events.push(...stepRace(race, 1 / 60).race);
      expect(events.filter((e) => e.kind === 'wreck' || e.kind === 'safety-car')).toEqual([]);
      const stops = (layout.tyreWear ?? 1) < 1 ? (n: number) => n <= 1 : (n: number) => n === 1;
      expect(race.entrants.every((e) => e.progress.finished !== undefined && stops(e.stops) && e.tyres.compound === tyreFor(weather))).toBe(true);
    },
    60_000,
  );
});
