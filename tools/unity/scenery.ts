// Browser half of `npm run unity:scenery` (grounds.mjs): the web game's whole circuit scene, built by its own code
// (createCircuitScene: towns and cities, buildings, landmarks, trees, grandstands, pits, barriers, bridges, lakes, the
// coast, the volcano, and its animals, planes, tramway, monster trucks...), written out for the Unity port, so Unity
// shows exactly what the web game builds without a second copy of 5,000 lines of scenery code.
//
// The scene is run for a while with a car going round, as in a race, to find what moves. The still parts are written as
// the web game holds them: each shape once (a "part": one geometry with one material) and every place it stands (its
// world matrices and tints, many for an instanced mesh: a forest's trees are a few shapes in thousands of places). What
// moves (but the crowds and the stands' flags, which StandView animates) is recorded: the same parts, with each copy's
// place 5 times a second over a 40 s loop of the scene's own animation, for the port to play back (SceneryMovers).
// The port puts it all together at load (BakedScenery), lighting each face as the web game does.
//
// The file (Resources/Scenery/<id>.bytes, little-endian), sizes in the web game's px and its axes (y up, z = map y):
//   "CCS3", int textures, int parts; per part:
//     int texture (-1: none), int flags (1 see-through, 2 nearest, 4 repeat, 8 unlit, 16 two-sided), float opacity,
//     float3 emissive (linear), int vertices, int indices,
//     float3 positions, sbyte4 normals (x, y, z, 0; /127), byte4 colours (sRGB, alpha), float2 uvs (textured parts only),
//     indices (ushort under 65,536 vertices, else int),
//     int places; per place: float12 matrix (3 rows of 4), byte4 tint (sRGB, 255).
//   then the movers' tracks (where a moving thing is, frame by frame: a plane, a boat, a bird, a petal; every part of
//     it rides on the one track): int tracks, float seconds between frames, int frames; per track: float3 origin, then
//     per frame half3 position (from the origin), half9 rotation and scale (the matrix's 3 x 3, rows), all zeros where
//     it's hidden.
//   then int moving parts; per moving part: the part as above, int copies; per copy: int track, float12 matrix (its
//     place on the track: world = track x this), byte4 tint.
// Textures: Resources/Scenery/<id>-<n>.png.
//
// The airliners over a circuit with an airport (they come and go, aimed over the camera, so the port flies them itself:
// ScenePlanes, a copy of planes.ts's PlaneRun): Resources/Scenery/<id>-planes.bytes,
//   "CCP1", float runway (radians, on the map), float hides (planes.ts's HIDES), float12 of PLANES' numbers (wait,
//   waitMore, first, speed arrive, depart, alt arrive, depart, sink, climb, lead, beyond, aside), float arrivals,
//   int models (one per tail colour); per model: int parts; per part: int role (0 body, 1 gear, 2 strobe), the part as
//   above, float12 matrix (in the plane, facing +x).
//
// The gopher (Maple Island) and the yeti (Glacier Pass) react to the car, so the port runs them itself too (Critters, a
// copy of gopher.ts's GopherRun and yeti.ts's YetiRun; CritterView draws them): Resources/Scenery/<id>-gopher.bytes and
// <id>-yeti.bytes,
//   "CCR1", int bytes + UTF-8 JSON of the numbers ({kind, gopher|yeti: GOPHER|YETI, halfWidth, avoid: [{x, y, r}]}),
//   int meshes; per mesh: int role (the gopher: 0 body, 1-4 feet, 5 a star, 6 a hole; the yeti: 0 body, 1 mouth,
//   2-3 arms, 4-5 legs), float3 pivot (where that piece hangs on the body, at rest), the part as above, float12 matrix
//   (in that piece).
import * as THREE from 'three';
import { createCircuitScene } from '../../src/f1/circuitScene';
import { DRY } from '../../src/f1/weather';
import { PLANES, planeModel } from '../../src/f1/planes';
import { HIDES } from '../../src/f1/town3d';
import { GOPHER, gopherModel } from '../../src/f1/gopher';
import { YETI, yetiAvoids, yetiModel } from '../../src/f1/yeti';
import { HALF_WIDTH } from '../../src/f1/circuit';
import type { Circuit } from '../../src/f1/circuit';

/** the web game's light on a face (its sky, a hemisphere at 1.35, and sun at 2.6; Lambert): BakedScenery does the same in C# */
const SUN_DIR = new THREE.Vector3(140, 260, 170).normalize();
const SKY = new THREE.Color(0xb8d4ff);
const GROUND = new THREE.Color(0x5a4f48);
const SUN = new THREE.Color(0xffe0b0);
export function lightOn(n: THREE.Vector3): THREE.Color {
  const hemi = GROUND.clone().lerp(SKY, 0.5 * n.y + 0.5).multiplyScalar(1.35);
  const sun = SUN.clone().multiplyScalar(2.6 * Math.max(0, n.dot(SUN_DIR)));
  return hemi.add(sun).multiplyScalar(1 / Math.PI);
}
export const FLAT = lightOn(new THREE.Vector3(0, 1, 0));
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** s between recorded frames, and how many: a 40 s loop at 5 a second (the port blends between them) */
const FRAME = 0.2;
const FRAMES = 200;

type Scene = ReturnType<typeof createCircuitScene>;

/** Runs the scene's animation on a frame, a car going round the racing line at 250 px/s (and the camera on it). */
function ticker(scene: Scene, c: Circuit) {
  const s = c.track.samples;
  let along = 0;
  let t = 0;
  return () => {
    t += FRAME;
    along = (along + (250 * FRAME) / c.track.spacing) % s.length;
    const p = s[Math.floor(along)];
    const car = { x: p.x, y: p.y, vx: Math.sin(p.dir) * 250, vy: -Math.cos(p.dir) * 250, speed: 250, heading: p.dir };
    scene.animate(t);
    scene.stepScenery(FRAME, [car as never], { x: car.x, y: car.y, vx: car.vx, vy: car.vy });
    scene.scene.updateMatrixWorld(true);
  };
}

const shown = (o: THREE.Object3D) => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};

/** Which meshes move: their world matrices, instance matrices or visibility change as the scene runs (for 40 s). */
function movers(scene: Scene, tick: () => void): Set<THREE.Object3D> {
  const snap = () => {
    const m = new Map<THREE.Object3D, string>();
    scene.scene.updateMatrixWorld(true);
    scene.scene.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      const inst = im.isInstancedMesh ? `${im.count}:` + Array.from(im.instanceMatrix.array.slice(0, 4096)).map((v) => v.toFixed(2)).join(',') : '';
      m.set(o, `${shown(o)}|${o.matrixWorld.elements.map((v) => v.toFixed(2)).join(',')}|${inst}`);
    });
    return m;
  };
  const before = snap();
  const moved = new Set<THREE.Object3D>();
  for (let step = 0; step < FRAMES; step++) {
    tick();
    if (step % 20 === 19) {
      const now = snap();
      for (const [o, k] of now) if (before.get(o) !== k) moved.add(o);
      for (const o of now.keys()) if (!before.has(o)) moved.add(o);
    }
  }
  const all = new Set<THREE.Object3D>();
  for (const o of moved) o.traverse((d) => all.add(d));
  return all;
}

/** StandView's own: the crowd's spectators (crowd3d.ts's boxes) and the stands' flags (13 x 8 planes). */
function standViews(mesh: THREE.Mesh): boolean {
  const p = (mesh.geometry as THREE.BufferGeometry & { parameters?: Record<string, number> }).parameters;
  if (!p) return false;
  const g = mesh.geometry.type;
  if (g === 'PlaneGeometry' && p.width === 13 && p.height === 8) return true;
  if (g === 'BoxGeometry' && (mesh as THREE.InstancedMesh).isInstancedMesh && ((p.width === 4.6 && p.height === 6.4) || (p.width === 3.4 && p.height === 3.4) || (p.width === 1.4 && p.height === 5))) return true;
  return false;
}

interface Place { m: THREE.Matrix4; tint: THREE.Color }
interface Proto { tex: number; flags: number; opacity: number; emissive: THREE.Color; pos: number[]; nor: number[]; col: number[]; uv: number[]; idx: number[]; places: Place[] }

/** The web game's scene for circuit `c`, as the Unity file, and what moves, by name. */
export function bakeScenery(c: Circuit, groundSize: { w: number; h: number }): { file: ArrayBuffer; planes?: ArrayBuffer; gopher?: ArrayBuffer; yeti?: ArrayBuffer; textures: string[]; moving: string[]; stats: string } {
  const scene = createCircuitScene(c, DRY);
  const tick = ticker(scene, c);
  const moving = movers(scene, tick);
  scene.scene.updateMatrixWorld(true);

  const textures: string[] = [];
  const texIndex = new Map<unknown, number>();
  const texOf = (map: THREE.Texture): number => {
    if (!texIndex.has(map.image)) {
      const img = map.image as HTMLCanvasElement;
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      if (!cv.width || !cv.height) return -1;
      cv.getContext('2d')!.drawImage(img, 0, 0);
      texIndex.set(map.image, textures.length);
      textures.push(cv.toDataURL('image/png'));
    }
    return texIndex.get(map.image)!;
  };
  const ic = new THREE.Color();

  /** a mesh's geometry groups with their materials as parts (a still one made once, however many meshes share it) */
  const shared = new Map<string, Proto>();
  const partsOf = (mesh: THREE.Mesh, still: boolean, into: Proto[], pool = shared): Proto[] => {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const g = mesh.geometry as THREE.BufferGeometry;
    const pos = g.getAttribute('position');
    if (!pos) return [];
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const vcol = g.getAttribute('color');
    const index = g.index;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
    const out: Proto[] = [];
    for (const grp of groups) {
      const mat = mats[grp.materialIndex ?? 0] ?? mats[0];
      if (!mat || !mat.visible) continue;
      const key = `${g.uuid}|${grp.start}|${mat.uuid}`;
      let proto = still ? pool.get(key) : undefined;
      if (!proto) {
        const anyMat = mat as THREE.MeshLambertMaterial & THREE.MeshBasicMaterial;
        const map = anyMat.map ?? undefined;
        let tex = -1;
        let flags = 0;
        if (map && map.image) {
          tex = texOf(map);
          map.updateMatrix();
          if (map.magFilter === THREE.NearestFilter) flags |= 2;
          if (map.wrapS === THREE.RepeatWrapping || map.wrapT === THREE.RepeatWrapping) flags |= 4;
        }
        const opacity = anyMat.opacity ?? 1;
        if (anyMat.transparent && opacity < 0.99) flags |= 1;
        if ((mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) flags |= 8;
        if (mat.side === THREE.DoubleSide) flags |= 16;
        const base = anyMat.color ? anyMat.color.clone() : new THREE.Color(0.7, 0.7, 0.7);
        const lam = mat as THREE.MeshLambertMaterial;
        const emissive = lam.emissive ? lam.emissive.clone().multiplyScalar(lam.emissiveIntensity ?? 1) : new THREE.Color(0, 0, 0);
        proto = { tex, flags, opacity, emissive, pos: [], nor: [], col: [], uv: [], idx: [], places: [] };
        const remap = new Map<number, number>();
        const end = Math.min(grp.start + grp.count, index ? index.count : pos.count);
        for (let i = grp.start; i < end; i++) {
          const src = index ? index.getX(i) : i;
          let dst = remap.get(src);
          if (dst === undefined) {
            dst = proto.pos.length / 3;
            remap.set(src, dst);
            proto.pos.push(pos.getX(src), pos.getY(src), pos.getZ(src));
            if (nor) proto.nor.push(nor.getX(src), nor.getY(src), nor.getZ(src));
            else proto.nor.push(0, 1, 0);
            const col = base.clone();
            if (vcol) col.multiply(ic.fromBufferAttribute(vcol as THREE.BufferAttribute, src));
            proto.col.push(toSrgb(Math.min(1, col.r)), toSrgb(Math.min(1, col.g)), toSrgb(Math.min(1, col.b)), flags & 1 ? opacity : 1);
            if (uv && map && tex >= 0) {
              const q = new THREE.Vector2().fromBufferAttribute(uv, src).applyMatrix3(map.matrix);
              proto.uv.push(q.x, map.flipY ? q.y : 1 - q.y);
            }
          }
          proto.idx.push(dst);
        }
        if (tex >= 0 && proto.uv.length !== (proto.pos.length / 3) * 2) {
          proto.tex = -1;
          proto.uv = [];
        }
        if (still) pool.set(key, proto);
        into.push(proto);
      }
      out.push(proto);
    }
    return out;
  };
  const statics: Proto[] = [];
  const movingNames = new Set<string>();
  /** what each moving object does over a loop: whether its own matrix or visibility (or an instance's) ever change */
  interface Watch { local: number[]; visible: boolean; varies: boolean; inst?: Float32Array; count?: number; instVaries?: boolean[] }
  const watch = new Map<THREE.Object3D, Watch>();
  for (const o of moving) {
    const im = o as THREE.InstancedMesh;
    watch.set(o, {
      local: o.matrix.elements.slice(), visible: o.visible, varies: false,
      ...(im.isInstancedMesh ? { inst: Float32Array.from(im.instanceMatrix.array), count: im.count, instVaries: new Array(im.instanceMatrix.count).fill(false) } : {}),
    });
  }
  const near = (a: ArrayLike<number>, b: ArrayLike<number>, at = 0, n = 16) => {
    for (let i = 0; i < n; i++) if (Math.abs(a[at + i] - b[at + i]) > 1e-3) return false;
    return true;
  };
  for (let f = 0; f < FRAMES; f++) {
    tick();
    for (const [o, w] of watch) {
      if (o.visible !== w.visible || !near(o.matrix.elements, w.local)) w.varies = true;
      const im = o as THREE.InstancedMesh;
      if (w.inst && w.instVaries) {
        const a = im.instanceMatrix.array;
        for (let k = 0; k < w.instVaries.length; k++) {
          if (w.instVaries[k]) continue;
          if (im.count !== w.count && (k < im.count) !== (k < w.count!)) w.instVaries[k] = true;
          else if (!near(a, w.inst, k * 16)) w.instVaries[k] = true;
        }
      }
    }
  }

  /** a track: an object (and an instance of it) whose place in the world is recorded */
  interface Track { o: THREE.Object3D; inst: number; frames: (THREE.Matrix4 | null)[] }
  const tracks: Track[] = [];
  const trackOf = new Map<string, Track>();
  const track = (o: THREE.Object3D, inst = -1): Track => {
    const k = `${o.uuid}|${inst}`;
    let t = trackOf.get(k);
    if (!t) {
      t = { o, inst, frames: [] };
      trackOf.set(k, t);
      tracks.push(t);
    }
    return t;
  };
  /** a moving mesh's copies: each on a track, and where on it */
  const copiesOf: { mesh: THREE.Mesh; copies: { t: Track; local: THREE.Matrix4; tint: THREE.Color }[] }[] = [];
  const placeNow = (t: Track): THREE.Matrix4 | null => {
    if (!shown(t.o)) return null;
    const m = t.o.matrixWorld.clone();
    if (t.inst >= 0) {
      const im = t.o as THREE.InstancedMesh;
      if (t.inst >= im.count) return null;
      const k = new THREE.Matrix4();
      im.getMatrixAt(t.inst, k);
      m.multiply(k);
    }
    return m;
  };

  // (the gopher and the yeti, their holes and stars: the port runs those itself, Critters)
  const critterMats = new Set<string>();
  for (const m of [gopherModel().group, yetiModel().group]) m.traverse((o) => (o as THREE.Mesh).isMesh && critterMats.add(((o as THREE.Mesh).material as THREE.Material).uuid));
  const critter = (mesh: THREE.Mesh) => {
    const g = mesh.geometry as THREE.BufferGeometry & { parameters?: Record<string, number> };
    const p = g.parameters;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    if (critterMats.has(mat.uuid)) return true;
    if (g.type === 'CylinderGeometry' && p && p.radiusTop === 4.2 && p.radiusBottom === 5 && p.height === 1) return true;
    return g.type === 'OctahedronGeometry' && !!p && p.radius === 1.5 && mat.color?.getHex() === 0xffe14a;
  };
  // (no airliner overhead as the scene's taken: the port flies those itself, ScenePlanes)
  for (let n = 0; n < 200 && scene.planes?.flights.length; n++) tick();
  scene.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat0 = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshLambertMaterial;
    const img0 = mat0?.map?.image as HTMLCanvasElement | undefined;
    // (the ground: the port has its picture already)
    if (img0 && img0.width === groundSize.w && img0.height === groundSize.h) return;
    if (critter(mesh)) return;
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : undefined;
    if (moving.has(mesh)) {
      if (standViews(mesh)) return;
      // the track the mesh rides on: up through what holds it while their own matrices and visibility stay put
      let owner: THREE.Object3D = mesh;
      const chain = new THREE.Matrix4();
      let hidden = false;
      while (!watch.get(owner)!.varies && owner.parent && moving.has(owner.parent)) {
        if (!owner.visible) hidden = true;
        chain.premultiply(owner.matrix);
        owner = owner.parent;
      }
      if (hidden) return;
      const w = watch.get(mesh)!;
      const copies: { t: Track; local: THREE.Matrix4; tint: THREE.Color }[] = [];
      const n = inst ? inst.instanceMatrix.count : 1;
      for (let k = 0; k < n; k++) {
        const tint = new THREE.Color(1, 1, 1);
        if (inst?.instanceColor) inst.getColorAt(k, tint);
        if (inst && w.instVaries![k]) {
          copies.push({ t: track(mesh, k), local: new THREE.Matrix4(), tint });
          continue;
        }
        if (inst && k >= w.count!) continue;
        const local = chain.clone();
        if (inst) {
          const im = new THREE.Matrix4();
          inst.getMatrixAt(k, im);
          local.multiply(im);
        }
        copies.push({ t: track(owner), local, tint });
      }
      if (copies.length) copiesOf.push({ mesh, copies });
      return;
    }
    if (!shown(mesh)) return;
    const n = inst ? inst.count : 1;
    const places: Place[] = [];
    for (let k = 0; k < n; k++) {
      const m = mesh.matrixWorld.clone();
      const tint = new THREE.Color(1, 1, 1);
      if (inst) {
        const im = new THREE.Matrix4();
        inst.getMatrixAt(k, im);
        m.multiply(im);
        if (inst.instanceColor) inst.getColorAt(k, tint);
      }
      places.push({ m, tint });
    }
    for (const p of partsOf(mesh, true, statics)) p.places.push(...places);
  });
  // record the tracks: the 40 s loop again, a frame at a time
  for (let f = 0; f < FRAMES; f++) {
    for (const t of tracks) t.frames.push(placeNow(t));
    tick();
  }
  // a track that never moves (or is never seen) isn't one: its copies are still, or gone
  const still = (t: Track) => t.frames.every((m) => m && t.frames[0] && near(m.elements, t.frames[0].elements));
  const unseen = (t: Track) => t.frames.every((m) => !m);
  const used: Track[] = [];
  const moverProtos = new Map<string, Proto>();
  const moverList: Proto[] = [];
  const copyList = new Map<Proto, { t: number; local: THREE.Matrix4; tint: THREE.Color }[]>();
  const trackIndex = new Map<Track, number>();
  for (const { mesh, copies } of copiesOf) {
    const live = copies.filter((c) => !unseen(c.t));
    const fixed = live.filter((c) => still(c.t));
    const moved = live.filter((c) => !still(c.t));
    if (fixed.length) {
      const places = fixed.map((c) => ({ m: c.t.frames[0]!.clone().multiply(c.local), tint: c.tint }));
      for (const p of partsOf(mesh, true, statics)) p.places.push(...places);
    }
    if (!moved.length) continue;
    movingNames.add(mesh.name || mesh.parent?.name || mesh.geometry.type);
    // (moving copies of one shape share it, as the still ones do)
    for (const p of partsOf(mesh, true, moverList, moverProtos)) {
      if (!copyList.has(p)) copyList.set(p, []);
      for (const c of moved) {
        if (!trackIndex.has(c.t)) { trackIndex.set(c.t, used.length); used.push(c.t); }
        copyList.get(p)!.push({ t: trackIndex.get(c.t)!, local: c.local, tint: c.tint });
      }
    }
  }

  // write it
  const enc = new Encoder();
  enc.str('CCS3');
  enc.int(textures.length);
  const list = statics.filter((p) => p.idx.length && p.places.length);
  enc.int(list.length);
  let verts = 0;
  let placed = 0;
  for (const p of list) {
    writePart(enc, p);
    enc.int(p.places.length);
    for (const pl of p.places) writePlace(enc, pl);
    verts += (p.pos.length / 3) * p.places.length;
    placed += p.places.length;
  }
  enc.int(used.length);
  enc.flt(FRAME);
  enc.int(FRAMES);
  for (const t of used) {
    const first = t.frames.find((m) => m)!.elements;
    const origin = [first[12], first[13], first[14]];
    for (const x of origin) enc.flt(x);
    for (const m of t.frames) {
      const e = m ? m.elements : new Array(16).fill(0);
      for (let a = 0; a < 3; a++) enc.half(m ? e[12 + a] - origin[a] : 0);
      for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) enc.half(e[col * 4 + r]);
    }
  }
  const moverParts = moverList.filter((p) => p.idx.length && copyList.get(p)?.length);
  enc.int(moverParts.length);
  let copies = 0;
  for (const p of moverParts) {
    writePart(enc, p);
    const cs = copyList.get(p)!;
    enc.int(cs.length);
    for (const c of cs) {
      enc.int(c.t);
      writePlace(enc, { m: c.local, tint: c.tint });
    }
    copies += cs.length;
  }
  const file = enc.done();

  // the airliners (planes.ts): each tail colour's model, its parts in place in it
  let planes: ArrayBuffer | undefined;
  const airport = c.layout.airport;
  if (airport) {
    const pe = new Encoder();
    pe.str('CCP1');
    pe.flt(airport.runway);
    pe.flt(HIDES);
    for (const v of [PLANES.wait, PLANES.waitMore, PLANES.first, PLANES.speed.arrive, PLANES.speed.depart, PLANES.alt.arrive, PLANES.alt.depart, PLANES.sink, PLANES.climb, PLANES.lead, PLANES.beyond, PLANES.aside]) pe.flt(v);
    pe.flt(PLANES.arrivals);
    const TAILS = [0x2f6fe0, 0xd8323c, 0x2f9a5a, 0xf2a03a, 0x6a3cc8, 0x1f2a5a];
    pe.int(TAILS.length);
    for (const tail of TAILS) {
      const model = planeModel(tail);
      model.group.updateMatrixWorld(true);
      const parts: { role: number; p: Proto; m: THREE.Matrix4 }[] = [];
      model.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        let role = 0;
        if (mesh === model.strobe) role = 2;
        else for (let q: THREE.Object3D | null = mesh; q; q = q.parent) if (q === model.gear) role = 1;
        for (const p of partsOf(mesh, false, [])) if (p.idx.length) parts.push({ role, p, m: mesh.matrixWorld.clone() });
      });
      pe.int(parts.length);
      for (const { role, p, m } of parts) {
        pe.int(role);
        writePart(pe, p);
        writePlace(pe, { m, tint: new THREE.Color(1, 1, 1) });
      }
    }
    planes = pe.done();
  }
  // the gopher and the yeti: their numbers, and their pieces
  const rig = (numbers: object, pieces: { role: number; node: THREE.Object3D; pivot: THREE.Vector3; root: THREE.Object3D }[]) => {
    const re = new Encoder();
    re.str('CCR1');
    const json = new TextEncoder().encode(JSON.stringify(numbers));
    re.int(json.length);
    for (const b of json) re.byte(b);
    const out: { role: number; pivot: THREE.Vector3; p: Proto; m: THREE.Matrix4 }[] = [];
    for (const { role, node, pivot, root } of pieces) {
      root.updateMatrixWorld(true);
      const inv = node.matrixWorld.clone().invert();
      const walk = (o: THREE.Object3D) => {
        // (a piece's own pieces are their own: an arm isn't the body's)
        if (o !== node && pieces.some((q) => q.node === o)) return;
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) for (const p of partsOf(mesh, false, [])) if (p.idx.length) out.push({ role, pivot, p, m: inv.clone().multiply(mesh.matrixWorld) });
        o.children.forEach(walk);
      };
      walk(node);
    }
    re.int(out.length);
    for (const { role, pivot, p, m } of out) {
      re.int(role);
      re.flt(pivot.x); re.flt(pivot.y); re.flt(pivot.z);
      writePart(re, p);
      writePlace(re, { m, tint: new THREE.Color(1, 1, 1) });
    }
    return re.done();
  };
  let gopher: ArrayBuffer | undefined;
  if (c.layout.gophers) {
    const g = gopherModel();
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), new THREE.MeshBasicMaterial({ color: 0xffe14a }));
    // (its hole, as buildGopher digs it: a dark hole in a ring of dug earth)
    const hole = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5, 1, 10), new THREE.MeshLambertMaterial({ color: 0x5e4630 }));
    mound.position.y = 0.3;
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.2, 10), new THREE.MeshLambertMaterial({ color: 0x2a1a10 }));
    pit.position.y = 0.85;
    hole.add(mound, pit);
    const zero = new THREE.Vector3();
    gopher = rig({ kind: 'gopher', gopher: GOPHER, halfWidth: HALF_WIDTH, avoid: [] }, [
      { role: 0, node: g.body, pivot: zero, root: g.group },
      ...g.feet.map((f, k) => ({ role: 1 + k, node: f, pivot: f.position.clone(), root: g.group })),
      { role: 5, node: star, pivot: zero, root: star },
      { role: 6, node: hole, pivot: zero, root: hole },
    ]);
  }
  let yeti: ArrayBuffer | undefined;
  if (c.layout.yeti) {
    const y = yetiModel();
    yeti = rig({ kind: 'yeti', yeti: YETI, halfWidth: HALF_WIDTH, avoid: yetiAvoids(c) }, [
      { role: 0, node: y.body, pivot: new THREE.Vector3(), root: y.group },
      { role: 1, node: y.mouth, pivot: y.mouth.position.clone(), root: y.group },
      ...y.arms.map((a, k) => ({ role: 2 + k, node: a, pivot: a.position.clone(), root: y.group })),
      ...y.legs.map((l, k) => ({ role: 4 + k, node: l, pivot: l.position.clone(), root: y.group })),
    ]);
  }
  return {
    file,
    planes,
    gopher,
    yeti,
    textures,
    moving: [...movingNames].sort(),
    stats: `${list.length} parts in ${placed} places, ${verts} vertices placed, ${moverParts.length} moving parts (${copies} copies on ${used.length} tracks), ${textures.length} textures, ${(file.byteLength / 1048576).toFixed(1)} MB`,
  };
}

function writePart(enc: Encoder, p: Proto) {
  const nv = p.pos.length / 3;
  enc.int(p.tex); enc.int(p.flags); enc.flt(p.opacity); enc.flt(p.emissive.r); enc.flt(p.emissive.g); enc.flt(p.emissive.b);
  enc.int(nv); enc.int(p.idx.length);
  for (const x of p.pos) enc.flt(x);
  for (let i = 0; i < p.nor.length; i += 3) {
    const l = Math.hypot(p.nor[i], p.nor[i + 1], p.nor[i + 2]) || 1;
    for (let a = 0; a < 3; a++) enc.sbyte(Math.round((p.nor[i + a] / l) * 127));
    enc.sbyte(0);
  }
  for (const x of p.col) enc.byte(x * 255);
  for (const x of p.uv) enc.flt(x);
  for (const x of p.idx) if (nv < 65536) enc.ushort(x); else enc.int(x);
}

function writePlace(enc: Encoder, pl: Place) {
  const e = pl.m.elements; // (three.js: column-major)
  for (let r = 0; r < 3; r++) for (let col = 0; col < 4; col++) enc.flt(e[col * 4 + r]);
  enc.byte(toSrgb(Math.min(1, pl.tint.r)) * 255); enc.byte(toSrgb(Math.min(1, pl.tint.g)) * 255); enc.byte(toSrgb(Math.min(1, pl.tint.b)) * 255); enc.byte(255);
}

/** A growing little-endian buffer. */
class Encoder {
  private buf = new ArrayBuffer(1 << 20);
  private dv = new DataView(this.buf);
  private o = 0;
  private room(n: number) {
    if (this.o + n <= this.buf.byteLength) return;
    let size = this.buf.byteLength * 2;
    while (size < this.o + n) size *= 2;
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(new Uint8Array(this.buf, 0, this.o));
    this.buf = next;
    this.dv = new DataView(next);
  }
  str(s: string) { this.room(s.length); for (const ch of s) this.dv.setUint8(this.o++, ch.charCodeAt(0)); }
  int(x: number) { this.room(4); this.dv.setInt32(this.o, x, true); this.o += 4; }
  flt(x: number) { this.room(4); this.dv.setFloat32(this.o, x, true); this.o += 4; }
  ushort(x: number) { this.room(2); this.dv.setUint16(this.o, x, true); this.o += 2; }
  byte(x: number) { this.room(1); this.dv.setUint8(this.o++, Math.max(0, Math.min(255, Math.round(x)))); }
  sbyte(x: number) { this.room(1); this.dv.setInt8(this.o++, Math.max(-127, Math.min(127, x))); }
  half(x: number) { this.room(2); this.dv.setUint16(this.o, toHalf(x), true); this.o += 2; }
  done(): ArrayBuffer { return this.buf.slice(0, this.o); }
}

/** A float as IEEE half (a mover's 3 x 3: rotation and scale, small numbers). */
function toHalf(v: number): number {
  const x = new Uint32Array(new Float32Array([v]).buffer)[0];
  const sign = (x >>> 16) & 0x8000;
  const e = ((x >>> 23) & 0xff) - 127 + 15;
  const m = x & 0x7fffff;
  if (e <= 0) return sign;
  if (e >= 31) return sign | 0x7bff;
  return sign | (e << 10) | (m >>> 13);
}
