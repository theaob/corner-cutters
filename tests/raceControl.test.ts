import { describe, expect, it } from 'vitest';
import { applyDamage, carClass, newCar, speedOf, type Car } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { LAYOUTS, SILVER_HEATH } from '../src/f1/layouts';
import { RACE_HANDLING, aiInput, lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { CLEAR_AFTER, SAFETY_CAR, isBigCrash, newRace, order, running, stepRace, type Race, type RaceEvent } from '../src/f1/raceControl';

const f1 = carClass('f1');
const dt = 1 / 60;

/** A full grid of 10 AI cars at the tuned pace; `player` makes one of them (P6 on the grid) the player's. */
function raceOn(layout = SILVER_HEATH, laps = 3, player?: number): Race {
  const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const field = c.slots.slice(0, 10).map((s, i) => ({
    car: newCar(f1, s.x, s.y, s.heading),
    ai: i === player ? undefined : { lane: ((i * 7) % 11) - 5, pace: 0.94 * (1 - (i / 10) * 0.05) },
  }));
  return newRace(c.track, c.grid, RACE_HANDLING, laps, field);
}

const over = (race: Race) => race.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired);

describe('big crashes', () => {
  it('are a wreck, or a single hit taking 40% of a car\'s health', () => {
    const car = newCar(f1, 0, 0);
    car.health = 50;
    expect(isBigCrash(car, 60, false)).toBe(false); // a knock: 10 of 60
    car.health = 30;
    expect(isBigCrash(car, 60, false)).toBe(true); // 30 of 60 at once
    expect(isBigCrash(car, 30, true)).toBe(true);
  });
});

describe('race control', () => {
  it.each(LAYOUTS)('runs a clean race at $name with no safety car', (layout) => {
    const race = raceOn(layout);
    const events: RaceEvent[] = [];
    for (let t = 0; t < 200 && !over(race); t += dt) events.push(...stepRace(race, dt).race);
    expect(events.map((e) => e.kind)).toEqual(['lights-out']);
    expect(race.entrants.every((e) => e.progress.finished !== undefined && !e.progress.retired)).toBe(true);
  }, 30_000);

  it('brings out the safety car for a wreck: the field queues behind it at a limited pace, the wreck is cleared, then racing resumes', () => {
    const race = raceOn();
    const events: { t: number; e: RaceEvent }[] = [];
    let victim = -1;
    let spreadAtCrash = 0;
    let spreadAtGreen = 0;
    let fastest = 0;
    let scSpeed = 0;
    let scOut = 0;
    /** track distance from the leader back to the last running car */
    const spread = () => {
      const n = race.track.samples.length;
      const on = order(race).map((i) => race.entrants[i]).filter((e) => running(e) && !e.car.wrecked);
      const at = (e: (typeof on)[0]) => e.progress.lap * n + e.progress.idx;
      return (at(on[0]) - at(on[on.length - 1])) * race.track.spacing;
    };
    for (let t = 0; t < 200 && !over(race); t += dt) {
      if (victim < 0 && race.phase === 'racing' && race.clock > 15) {
        victim = order(race)[4];
        applyDamage(race.entrants[victim].car, 1000, RACE_HANDLING);
        spreadAtCrash = spread();
      }
      const step = stepRace(race, dt).race;
      for (const e of step) {
        events.push({ t: race.clock, e });
        if (e.kind === 'green') spreadAtGreen = spread();
      }
      if (race.sc) {
        scOut += dt;
        // once the field has had a few seconds to slow, nobody running goes over the limiter
        if (scOut > 3) for (const e of race.entrants) if (running(e) && !e.car.wrecked && e.progress.finished === undefined) fastest = Math.max(fastest, speedOf(e.car));
        if (scOut > 3) scSpeed = Math.max(scSpeed, speedOf(race.sc.car));
      }
    }
    const kinds = events.map((x) => x.e.kind);
    expect(kinds).toEqual(['lights-out', 'wreck', 'safety-car', 'retired', 'green']);
    const at = (k: string) => events.find((x) => x.e.kind === k)!.t;
    // out at once, cleared after CLEAR_AFTER, in once the queue has run behind it
    expect(at('safety-car')).toBeCloseTo(at('wreck'), 1);
    expect(at('retired') - at('wreck')).toBeCloseTo(CLEAR_AFTER, 1);
    expect(at('green') - at('safety-car')).toBeGreaterThanOrEqual(SAFETY_CAR.leadFor);
    expect(at('green') - at('safety-car')).toBeLessThanOrEqual(SAFETY_CAR.maxOut);
    expect(fastest).toBeLessThanOrEqual(SAFETY_CAR.limit + 5);
    // …and the safety car, and the cars catching it up, really do run at those speeds
    expect(scSpeed).toBeGreaterThan(SAFETY_CAR.speed - 5);
    expect(fastest).toBeGreaterThan(SAFETY_CAR.limit - 10);
    expect(spreadAtGreen).toBeLessThan(spreadAtCrash);
    // the AI keeps its place behind it; everyone else finishes, the wreck classified last as DNF
    expect(race.entrants.every((e) => e.progress.penalty === 0)).toBe(true);
    const final = order(race);
    expect(final[final.length - 1]).toBe(victim);
    expect(race.entrants[victim].progress.retired).toBe(true);
    expect(race.entrants.filter((e) => e.progress.finished !== undefined)).toHaveLength(9);
  }, 30_000);

  it('penalises passing under the safety car, 5 s a place', () => {
    // from the back of the grid, the player's car ignores the queue: it drives the line on its own, lane wide,
    // as fast as the limiter allows
    const you = 9;
    const race = raceOn(SILVER_HEATH, 3, you);
    const me = race.entrants[you];
    const reckless = () => aiInput(me.car, race.track, me.progress.idx, { lane: 30, pace: 1 });
    let crashed = false;
    let penalties = 0;
    for (let t = 0; t < 200 && !over(race); t += dt) {
      // (early, while the player is still behind most of the field)
      if (!crashed && race.phase === 'racing' && race.clock > 4) {
        applyDamage(race.entrants[order(race)[0] === you ? order(race)[1] : order(race)[0]].car, 1000, RACE_HANDLING);
        crashed = true;
      }
      for (const e of stepRace(race, dt, reckless).race) if (e.kind === 'penalty' && e.who === you) penalties++;
    }
    expect(penalties).toBeGreaterThan(0);
    expect(me.progress.penalty).toBe(penalties * SAFETY_CAR.penalty);
    // nobody else was penalised
    expect(race.entrants.filter((e) => e !== me).every((e) => e.progress.penalty === 0)).toBe(true);
  }, 30_000);

  it("won't let the player past the safety car itself", () => {
    // on pole, flat out on the racing line; a backmarker crashes
    const race = raceOn(SILVER_HEATH, 3, 0);
    const me = race.entrants[0];
    const flatOut = () => aiInput(me.car, race.track, me.progress.idx, { lane: 0, pace: 1 });
    const n = race.track.samples.length;
    let crashed = false;
    let behind = true;
    let out = 0;
    let green = false;
    for (let t = 0; t < 120 && !green; t += dt) {
      if (!crashed && race.phase === 'racing' && race.clock > 12) {
        applyDamage(race.entrants[order(race)[9]].car, 1000, RACE_HANDLING);
        crashed = true;
      }
      green = stepRace(race, dt, flatOut).race.some((e) => e.kind === 'green');
      if (race.sc) {
        out += dt;
        // the safety car stays up the road: less than half a lap ahead of us
        const ahead = (((race.sc.idx - me.progress.idx) % n) + n) % n;
        behind &&= ahead > 0 && ahead < n / 2;
      }
    }
    expect(crashed && green).toBe(true);
    expect(behind).toBe(true);
    // in on the queue's schedule, not the time limit
    expect(out).toBeLessThan(SAFETY_CAR.maxOut - 5);
    expect(me.progress.penalty).toBe(0);
  }, 30_000);

  it('holds everyone on the grid until the lights go out', () => {
    const race = raceOn();
    const start = race.entrants.map((e) => ({ x: e.car.x, y: e.car.y }));
    for (let t = 0; t < 3; t += dt) stepRace(race, dt, () => ({ steer: { x: 0, y: -1 }, handbrake: false }));
    expect(race.phase).toBe('lights');
    race.entrants.forEach((e: { car: Car }, i) => expect(Math.hypot(e.car.x - start[i].x, e.car.y - start[i].y)).toBeLessThan(1));
  });
});
