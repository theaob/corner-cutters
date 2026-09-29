// Car effects for a 3D scene: skid marks painted onto the ground, smoke from
// damaged cars, fire on burning ones, and charred paint on
// wrecks. Driven each frame from the engine-free car state.

import * as THREE from 'three';
import { canvas } from './sprites';
import type { CarMesh } from './vehicles3d';

const SKID_CHUNK = 256;

interface SkidChunk {
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  dirty: boolean;
}

/**
 * Dark marks left by sliding tyres, drawn into canvases laid over the ground.
 * The ground is split into 256 px chunks, made on first use, so a skid only
 * re-uploads the small texture it touched.
 */
export class SkidLayer {
  readonly group = new THREE.Group();
  private readonly chunks = new Map<string, SkidChunk>();
  private readonly last = new Map<number, { x: number; y: number }[]>();
  private sinceUpload = 0;

  /** `heightAt` (world px → px): lay the marks over sloped ground; flat when omitted. */
  constructor(private readonly heightAt?: (x: number, y: number) => number) {}

  private chunk(cx: number, cy: number): SkidChunk {
    const key = `${cx},${cy}`;
    let ch = this.chunks.get(key);
    if (ch) return ch;
    const [c, ctx] = canvas(SKID_CHUNK, SKID_CHUNK);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    // on sloped ground the chunk bends to follow it, one segment per 16 px
    const segs = this.heightAt ? SKID_CHUNK / 16 : 1;
    const geo = new THREE.PlaneGeometry(SKID_CHUNK, SKID_CHUNK, segs, segs).rotateX(-Math.PI / 2);
    if (this.heightAt) {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, this.heightAt((cx + 0.5) * SKID_CHUNK + pos.getX(i), (cy + 0.5) * SKID_CHUNK + pos.getZ(i)) + 0.3);
      }
      geo.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.position.set((cx + 0.5) * SKID_CHUNK, 0.05, (cy + 0.5) * SKID_CHUNK);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    ch = { ctx, tex, dirty: false };
    this.chunks.set(key, ch);
    return ch;
  }

  /** A line in world pixels, drawn into every chunk it touches. */
  private line(a: { x: number; y: number }, b: { x: number; y: number }, style: string): void {
    const x0 = Math.floor((Math.min(a.x, b.x) - 2) / SKID_CHUNK);
    const x1 = Math.floor((Math.max(a.x, b.x) + 2) / SKID_CHUNK);
    const y0 = Math.floor((Math.min(a.y, b.y) - 2) / SKID_CHUNK);
    const y1 = Math.floor((Math.max(a.y, b.y) + 2) / SKID_CHUNK);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const ch = this.chunk(cx, cy);
        const ox = cx * SKID_CHUNK;
        const oy = cy * SKID_CHUNK;
        ch.ctx.strokeStyle = style;
        ch.ctx.lineWidth = 2;
        ch.ctx.beginPath();
        ch.ctx.moveTo(a.x - ox, a.y - oy);
        ch.ctx.lineTo(b.x - ox + 0.01, b.y - oy);
        ch.ctx.stroke();
        ch.dirty = true;
      }
    }
  }

  /**
   * Continue the marks under both rear wheels of car `id` at (x, y) facing
   * `heading`. Call `lift(id)` on frames the car isn't skidding, so separate
   * slides don't join up.
   */
  mark(id: number, x: number, y: number, heading: number, strength: number, size = { width: 14, length: 26 }): void {
    const fx = Math.sin(heading);
    const fy = -Math.cos(heading);
    const back = size.length / 2 - 5;
    const half = size.width / 2 - 1;
    const wheels = [-1, 1].map((s) => ({ x: x - fx * back - fy * s * half, y: y - fy * back + fx * s * half }));
    const prev = this.last.get(id);
    const style = `rgba(20,18,24,${Math.min(0.55, 0.2 + strength * 0.35)})`;
    wheels.forEach((w, i) => this.line(prev?.[i] ?? w, w, style));
    this.last.set(id, wheels);
  }

  lift(id: number): void {
    this.last.delete(id);
  }

  clear(): void {
    for (const ch of this.chunks.values()) {
      ch.ctx.clearRect(0, 0, SKID_CHUNK, SKID_CHUNK);
      ch.dirty = true;
    }
    this.last.clear();
  }

  /** Upload changed chunks at most ~15 times a second. */
  update(dt: number): void {
    this.sinceUpload += dt;
    if (this.sinceUpload < 1 / 15) return;
    this.sinceUpload = 0;
    for (const ch of this.chunks.values()) {
      if (!ch.dirty) continue;
      ch.tex.needsUpdate = true;
      ch.dirty = false;
    }
  }
}

function puffTexture(): THREE.Texture {
  const [c, x] = canvas(16, 16);
  const g = x.createRadialGradient(8, 8, 1, 8, 8, 8);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 16, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Puff {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  grow: number;
}

/** A fixed pool of smoke and flame puffs. */
export class Particles {
  readonly group = new THREE.Group();
  private readonly pool: Puff[] = [];
  private next = 0;

  constructor(size = 90) {
    const tex = puffTexture();
    for (let i = 0; i < size; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sprite.visible = false;
      this.group.add(sprite);
      this.pool.push({ sprite, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, grow: 0 });
    }
  }

  private spawn(x: number, z: number, y: number, color: number, life: number, size: number, rise: number, additive: boolean): void {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    const m = p.sprite.material;
    m.color.setHex(color);
    m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.sprite.position.set(x + (Math.random() - 0.5) * 6, y, z + (Math.random() - 0.5) * 6);
    p.sprite.scale.setScalar(size);
    p.sprite.visible = true;
    p.life = p.maxLife = life;
    p.vx = (Math.random() - 0.5) * 6;
    p.vz = (Math.random() - 0.5) * 6;
    p.vy = rise;
    p.grow = size * 1.2;
  }

  /** A low brown cloud kicked up on rough ground. */
  dust(x: number, z: number, base = 0): void {
    this.spawn(x, z, base + 4, Math.random() < 0.5 ? 0xe0cca4 : 0xc8a878, 1.0, 10, 6, false);
  }

  smoke(x: number, z: number, dark: boolean, base = 0): void {
    this.spawn(x, z, base + 10, dark ? 0x2a2830 : 0x8a8894, 1.4, 6, 14, false);
  }

  flame(x: number, z: number, base = 0): void {
    this.spawn(x, z, base + 13, Math.random() < 0.5 ? 0xff7a1a : 0xffc23a, 0.5, 10, 24, true);
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      p.sprite.scale.addScalar(p.grow * dt);
      p.sprite.material.opacity = (p.life / p.maxLife) * 0.8;
    }
  }

  clear(): void {
    for (const p of this.pool) p.sprite.visible = false;
  }
}

/** Per-car visual state: remembers the original paint so wrecks can be charred and repaired. */
export class CarFx {
  readonly light = new THREE.PointLight(0xff8a2a, 0, 70, 1.5);
  private readonly original: THREE.Color[];
  private emit = 0;
  private dustEmit = 0;

  /**
   * `fireLight: false` skips the flickering fire light: for cars that
   * come and go, since adding or removing a light recompiles every shader.
   */
  constructor(readonly mesh: CarMesh, fireLight = true) {
    this.original = mesh.userData.paint.map((m) => m.color.clone());
    this.light.position.set(0, 12, 0);
    if (fireLight) mesh.add(this.light);
  }

  /**
   * `condition` comes from the driving rules.
   * The fire light is always in the scene (intensity 0 when off) so turning it
   * on doesn't recompile shaders mid-drive.
   */
  /** `dust` (0…1): how hard the car is kicking up dust on rough ground (0 = none). */
  update(dt: number, condition: 'ok' | 'smoking' | 'burning' | 'wrecked', particles: Particles, dust = 0): void {
    const { x, y, z } = this.mesh.position;
    this.dustEmit -= dt;
    if (dust > 0 && this.dustEmit <= 0) {
      particles.dust(x, z, y);
      this.dustEmit = 0.2 - dust * 0.15;
    }
    this.emit -= dt;
    if (this.emit <= 0 && condition !== 'ok') {
      if (condition === 'smoking') {
        particles.smoke(x, z, false, y);
        this.emit = 0.18;
      } else if (condition === 'burning') {
        particles.flame(x, z, y);
        if (Math.random() < 0.5) particles.smoke(x, z, true, y);
        this.emit = 0.05;
      } else {
        particles.smoke(x, z, true, y);
        this.emit = 0.35;
      }
    }
    this.light.intensity = condition === 'burning' ? 120 + Math.random() * 80 : 0;

    const char = condition === 'wrecked' ? 0.22 : condition === 'burning' ? 0.6 : 1;
    this.mesh.userData.paint.forEach((m, i) => m.color.copy(this.original[i]).multiplyScalar(char));
  }
}
