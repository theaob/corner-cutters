import { describe, expect, it } from 'vitest';
import { REPLAY, newReplay, recordReplay, replayPose, replaySpeed, replayWindow, type Pose } from '../src/f1/replay';

/** Two cars driving north at 100 px/s; the second only from t = 3 (before that it's off the track). */
const at = (t: number): (Pose | undefined)[] => [{ x: 0, y: -100 * t, z: 1, heading: 0 }, t >= 3 ? { x: 30, y: -100 * t, z: 1, heading: 0.1 } : undefined];

function recorded(until: number) {
  const r = newReplay(2);
  // (stepped at 60 Hz, as the race is)
  for (let t = 0; t <= until + 1e-9; t += 1 / 60) recordReplay(r, t, at(t));
  return r;
}

describe('the replay', () => {
  it('records 20 frames a second, and keeps only the last 15 seconds', () => {
    const r = recorded(30);
    expect(r.frames.length).toBe(REPLAY.keep * REPLAY.hz);
    expect(r.start).toBeCloseTo(30 - REPLAY.keep + 1 / REPLAY.hz, 5);
  });
  it('plays a car back where it was, between frames', () => {
    const r = recorded(30);
    const p = replayPose(r, 0, 22.37)!;
    expect(p.y).toBeCloseTo(-2237, 0);
    expect(p.z).toBeCloseTo(1);
    // before what's kept, or after: nothing
    expect(replayPose(r, 0, 10)).toBeUndefined();
    expect(replayPose(r, 0, 31)).toBeUndefined();
  });
  it("doesn't show a car where it wasn't on the track", () => {
    const r = recorded(8);
    expect(replayPose(r, 1, 2)).toBeUndefined();
    expect(replayPose(r, 1, 5)!.x).toBeCloseTo(30);
  });
  it('runs 10 seconds, to just after your finish, slowing through the line', () => {
    const r = recorded(30);
    const w = replayWindow(r, 26);
    expect(w.to).toBeCloseTo(26 + REPLAY.after);
    expect(w.to - w.from).toBeCloseTo(REPLAY.length);
    // (a finish soon after the start: only what was recorded)
    expect(replayWindow(recorded(5), 4).from).toBe(0);
    expect(replaySpeed(26.5, 26)).toBe(REPLAY.slow);
    expect(replaySpeed(22, 26)).toBe(1);
  });
});
