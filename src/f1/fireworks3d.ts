// Fireworks over the circuit at the end of the Championship: from the moment
// the winner takes the chequered flag in its last round, a burst in the sky
// every half second or so, each a ball of sparks in its own colour, flying out,
// falling and fading (unlit, so the glow takes them: at a circuit at night,
// they light up the sky). They burst over the picture: over where the camera
// is (a thing up high shows further up the screen than the ground under it, so
// that much nearer the camera), a little to either side and up and down it.
// Engine-free (when and where they burst: FireworkShow, unit-tested);
// buildFireworks draws them.

import * as THREE from 'three';
import { HIDES } from './town3d';

export const FIREWORKS = {
  /** s between bursts (at least, and up to this much more), and s the show goes on */
  every: 0.45,
  everyMore: 0.5,
  lasts: 24,
  /** px up they burst (at least, and up to this much more); px to either side of the camera, and up and down the picture */
  high: 140,
  higher: 90,
  aside: 80,
  along: 120,
  /** sparks in a burst, their px/s out, px/s² they fall, s they last */
  sparks: 90,
  speed: 110,
  fall: 40,
  life: 1.8,
  /** bursts in the sky at once, at most */
  pool: 6,
};

const COLORS = [0xff3fa8, 0x3ff0ff, 0xfff04a, 0x5cff7a, 0xb05cff, 0xffa23f, 0xffffff, 0xff4a4a];

export interface Burst {
  x: number;
  y: number;
  z: number;
  color: number;
}

/** The show: started once (at the winner's flag), it gives a burst every so often over where the camera is, till it's over. */
export class FireworkShow {
  /** s since it started (undefined: not yet) */
  t?: number;
  bursts = 0;
  private due = 0;
  private seed = 77;

  private r(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  start(): void {
    if (this.t === undefined) this.t = 0;
  }

  get on(): boolean {
    return this.t !== undefined && this.t < FIREWORKS.lasts;
  }

  /** `dt` s on, the camera on `focus`: the bursts due now. */
  step(dt: number, focus: { x: number; y: number }): Burst[] {
    if (!this.on) return [];
    this.t! += dt;
    this.due -= dt;
    const out: Burst[] = [];
    while (this.due <= 0 && this.on) {
      this.due += FIREWORKS.every + this.r() * FIREWORKS.everyMore;
      const z = FIREWORKS.high + this.r() * FIREWORKS.higher;
      out.push({
        x: focus.x + (this.r() * 2 - 1) * FIREWORKS.aside,
        // (over the picture: its spot that much nearer the camera than the ground it shows over)
        y: focus.y + z * HIDES + (this.r() * 2 - 1) * FIREWORKS.along,
        z,
        color: COLORS[Math.floor(this.r() * COLORS.length)],
      });
      this.bursts++;
    }
    return out;
  }
}

/** The fireworks in `scene`: a pool of bursts of sparks. Gives back the show, and its step (`dt` s on, the camera on `focus`, the ground's height there); `onBurst` for each (its bang). */
export function buildFireworks(scene: THREE.Scene, onBurst: () => void): { show: FireworkShow; step: (dt: number, focus: { x: number; y: number }, ground: number) => void } {
  const show = new FireworkShow();
  const N = FIREWORKS.sparks;
  const pool = Array.from({ length: FIREWORKS.pool }, () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 8, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    scene.add(points);
    return { points, mat, vel: new Float32Array(N * 3), age: Infinity };
  });
  let seed = 5;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const step = (dt: number, focus: { x: number; y: number }, ground: number) => {
    for (const b of show.step(dt, focus)) {
      // (the oldest burst's sparks, flown out afresh)
      const p = pool.reduce((a, c) => (c.age > a.age ? c : a));
      p.age = 0;
      p.mat.color.setHex(b.color);
      p.points.visible = true;
      const pos = p.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < N; k++) {
        // (out every way from the middle, a little uneven)
        const a = r() * Math.PI * 2;
        const e = Math.asin(r() * 2 - 1);
        const s = FIREWORKS.speed * (0.8 + r() * 0.3);
        pos.setXYZ(k, b.x, ground + b.z, b.y);
        p.vel[k * 3] = Math.cos(a) * Math.cos(e) * s;
        p.vel[k * 3 + 1] = Math.sin(e) * s;
        p.vel[k * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
      }
      pos.needsUpdate = true;
      onBurst();
    }
    for (const p of pool) {
      if (p.age === Infinity) continue;
      p.age += dt;
      if (p.age > FIREWORKS.life) {
        p.age = Infinity;
        p.points.visible = false;
        continue;
      }
      const pos = p.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const drag = Math.exp(-dt * 1.6);
      for (let k = 0; k < N; k++) {
        p.vel[k * 3] *= drag;
        p.vel[k * 3 + 1] = p.vel[k * 3 + 1] * drag - FIREWORKS.fall * dt;
        p.vel[k * 3 + 2] *= drag;
        pos.setXYZ(k, pos.getX(k) + p.vel[k * 3] * dt, pos.getY(k) + p.vel[k * 3 + 1] * dt, pos.getZ(k) + p.vel[k * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      // (bright, then fading out, twinkling as it goes)
      const u = p.age / FIREWORKS.life;
      p.mat.opacity = (1 - u * u) * (u > 0.6 ? 0.7 + 0.3 * Math.sin(p.age * 40) : 1);
    }
  };
  return { show, step };
}
