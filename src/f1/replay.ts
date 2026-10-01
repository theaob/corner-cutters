// The replay after your flag: every car on the track (and the safety car) is
// recorded through the race, 20 times a second, the last 15 seconds kept; a
// few seconds after you take the flag the race holds and the 10 seconds up to
// just past your finish play again, slowing as you cross the line. Engine-free.

/** Where a car is: on the ground (x, y), its height, its heading. */
export interface Pose {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export const REPLAY = {
  /** frames a second, and seconds kept */
  hz: 20,
  keep: 15,
  /** seconds replayed, ending this long after your finish */
  length: 10,
  after: 1.5,
  /** seconds after your finish (the flag, live) that the replay starts */
  startAt: 3.5,
  /** within this many seconds of the line, it plays at this speed */
  slowWithin: 1,
  slow: 0.4,
};

/** numbers per car per frame: x, y, z, heading, and whether it's on the track (1) or not (0) */
const STRIDE = 5;

export interface ReplayRecorder {
  /** cars recorded (each frame has them all, in order) */
  cars: number;
  /** race time of the first frame kept */
  start: number;
  frames: Float32Array[];
}

export const newReplay = (cars: number): ReplayRecorder => ({ cars, start: 0, frames: [] });

/** Record the cars at race time `t` (a frame whenever one is due; a car undefined isn't on the track). */
export function recordReplay(r: ReplayRecorder, t: number, cars: (Pose | undefined)[]): void {
  if (!r.frames.length) r.start = t;
  while (r.start + r.frames.length / REPLAY.hz <= t + 1e-6) {
    const f = new Float32Array(r.cars * STRIDE);
    cars.forEach((c, i) => {
      if (c) f.set([c.x, c.y, c.z, c.heading, 1], i * STRIDE);
    });
    r.frames.push(f);
  }
  // (only the last few seconds are kept)
  const over = r.frames.length - REPLAY.keep * REPLAY.hz;
  if (over > 0) {
    r.frames.splice(0, over);
    r.start += over / REPLAY.hz;
  }
}

/** Where car `i` was at race time `t` (between frames); undefined if it wasn't on the track, or `t` wasn't recorded. */
export function replayPose(r: ReplayRecorder, i: number, t: number): Pose | undefined {
  const at = (t - r.start) * REPLAY.hz;
  if (at < 0 || at > r.frames.length - 1 || !r.frames.length) return undefined;
  const k = Math.min(r.frames.length - 2, Math.floor(at));
  if (k < 0) return undefined;
  const f = at - k;
  const a = r.frames[k];
  const b = r.frames[k + 1];
  const o = i * STRIDE;
  if (!a[o + 4] || !b[o + 4]) return undefined;
  const turn = Math.atan2(Math.sin(b[o + 3] - a[o + 3]), Math.cos(b[o + 3] - a[o + 3]));
  return { x: a[o] + (b[o] - a[o]) * f, y: a[o + 1] + (b[o + 1] - a[o + 1]) * f, z: a[o + 2] + (b[o + 2] - a[o + 2]) * f, heading: a[o + 3] + turn * f };
}

/** The race times a replay of your finish at `finish` runs between, within what's recorded. */
export function replayWindow(r: ReplayRecorder, finish: number): { from: number; to: number } {
  const end = r.start + (r.frames.length - 1) / REPLAY.hz;
  const to = Math.min(end, finish + REPLAY.after);
  return { from: Math.max(r.start, to - REPLAY.length), to };
}

/** How fast the replay plays at race time `t` (slow through the finish at `finish`). */
export const replaySpeed = (t: number, finish: number) => (Math.abs(t - finish) <= REPLAY.slowWithin ? REPLAY.slow : 1);
