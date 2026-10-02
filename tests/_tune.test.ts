import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { check, circuitOf, mainStraight } from '../src/designer/layoutEdit';
import type { CircuitLayout } from '../src/f1/layouts';
import { carClass, newCar, stepCar } from '../src/engine/driving';
import { RACE_HANDLING, aiInput, newProgress, stepProgress } from '../src/f1/racing';

const SP = '/tmp/claude-0/-home-user-corner-cutters/78205eaa-9261-5478-84b6-5b5d926bee5f/scratchpad/tracks/';
const f1 = carClass('f1');
it('tune', () => {
  const cands = JSON.parse(readFileSync(SP + 'cands.json', 'utf8')) as CircuitLayout[];
  for (const raw of cands) {
    const layout = { ...raw, points: (raw.points as unknown as [number, number][]).map(([x, y]) => ({ x, y })) } as CircuitLayout;
    const c = circuitOf(layout);
    const lapWith = (pace: number) => {
      const s = c.slots[0];
      const car = newCar(f1, s.x, s.y, s.heading);
      let p = newProgress(c.track.samples.length - 3);
      let braking = 0;
      for (let t = 0; t < 120 && p.lap < 1; t += 1 / 60) {
        const input = aiInput(car, c.track, p.idx, { lane: 0, pace });
        if (input.brake) braking += 1 / 60;
        stepCar(car, input, RACE_HANDLING, 1 / 60, c.grid);
        p = stepProgress(p, c.track, car, t, 3, 1 / 60);
      }
      return { time: p.lapTimes[0], braking, dmg: f1.health - car.health };
    };
    const line = lapWith(1);
    const flat = lapWith(10);
    console.log(`\n== ${layout.id}: straight ${JSON.stringify(mainStraight(c))}`);
    for (const k of check(layout, c)) console.log(`${k.ok ? 'ok ' : 'BAD'} ${k.label}: ${k.value}`);
    console.log(`line ${line.time?.toFixed(2)} brake ${line.braking.toFixed(2)} dmg ${line.dmg} | flat ${flat.time?.toFixed(2)} dmg ${flat.dmg}`);
  }
}, 600000);
