// A check of what unity:scenery wrote, without Unity: ?id=<circuit>&x=&y=&d= (map px, camera distance in px). Loads
// Resources/Scenery/<id>.bytes and the ground picture and draws them in the web game's space, lit as the port lights them, from
// the port's camera (26 degree lens, 52 degree pitch, north up). Used by tools/unity/preview.mjs for screenshots.
import * as THREE from 'three';
import { FLAT, lightOn } from './scenery';

declare global { interface Window { previewReady: boolean } }

const q = new URLSearchParams(location.search);
const id = q.get('id') ?? 'crescent-park';
const root = '/unity/Assets/Resources';

async function main() {
  const meta = await (await fetch(`${root}/Circuits/${id}.json`)).json();
  const W = meta.width * 16, H = meta.height * 16;
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(1280, 720);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb8e8);
  const loader = new THREE.TextureLoader();
  const ground = await loader.loadAsync(`${root}/Grounds/${id}.png`);
  ground.magFilter = THREE.NearestFilter;
  ground.colorSpace = THREE.NoColorSpace;
  // the ground: flat at height 0 is close enough for a look
  const g = new THREE.Mesh(new THREE.PlaneGeometry(W / 16, H / 16), new THREE.MeshBasicMaterial({ map: ground, side: THREE.DoubleSide }));
  g.rotation.x = -Math.PI / 2;
  g.position.set(W / 32, -0.01, H / 32);
  scene.add(g);
  const buf = await (await fetch(`${root}/Scenery/${id}.bytes`)).arrayBuffer();
  const dv = new DataView(buf);
  let o = 4;
  const int = () => { const v = dv.getInt32(o, true); o += 4; return v; };
  const flt = () => { const v = dv.getFloat32(o, true); o += 4; return v; };
  const texCount = int();
  const partCount = int();
  const texes: THREE.Texture[] = [];
  for (let k = 0; k < texCount; k++) {
    const t = await loader.loadAsync(`${root}/Scenery/${id}-${k}.png`);
    t.colorSpace = THREE.NoColorSpace;
    texes.push(t);
  }
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const srgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const nm = new THREE.Matrix3();
  const nv3 = new THREE.Vector3();
  const readPart = () => {
    const tex = int(); const flags = int(); const opacity = flt();
    const em = [flt(), flt(), flt()];
    const nv = int(); const ni = int();
    const pos: number[] = []; for (let i = 0; i < nv * 3; i++) pos.push(flt());
    const nor: number[] = []; for (let i = 0; i < nv; i++) { nor.push(dv.getInt8(o) / 127, dv.getInt8(o + 1) / 127, dv.getInt8(o + 2) / 127); o += 4; }
    const col: number[] = []; for (let i = 0; i < nv * 4; i++) { col.push(dv.getUint8(o) / 255); o += 1; }
    const uv: number[] = []; if (tex >= 0) for (let i = 0; i < nv * 2; i++) uv.push(flt());
    const idx: number[] = []; for (let i = 0; i < ni; i++) { if (nv < 65536) { idx.push(dv.getUint16(o, true)); o += 2; } else idx.push(int()); }
    return { tex, flags, opacity, em, nv, pos, nor, col, uv, idx };
  };
  const readPlace = () => {
    const e: number[] = []; for (let i = 0; i < 12; i++) e.push(flt());
    const tint = [lin(dv.getUint8(o) / 255), lin(dv.getUint8(o + 1) / 255), lin(dv.getUint8(o + 2) / 255)]; o += 4;
    return { m: new THREE.Matrix4().set(e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8], e[9], e[10], e[11], 0, 0, 0, 1), tint };
  };
  const build = (part: ReturnType<typeof readPart>, places: { m: THREE.Matrix4; tint: number[] }[]) => {
    const { tex, flags, opacity, em, nv, pos, nor, col, uv, idx } = part;
    const outPos: number[] = [], outCol: number[] = [], outUv: number[] = [], outIdx: number[] = [];
    for (const { m, tint } of places) {
      nm.getNormalMatrix(m);
      const at = outPos.length / 3;
      for (let i = 0; i < nv; i++) {
        const v = new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(m);
        outPos.push(v.x / 16, v.y / 16, v.z / 16);
        nv3.set(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]).applyMatrix3(nm).normalize();
        if (flags & 16 && nv3.y < 0) nv3.negate();
        const L = flags & 8 ? FLAT : lightOn(nv3);
        for (let a = 0; a < 3; a++) {
          const c = lin(col[i * 4 + a]) * tint[a] * [L.r, L.g, L.b][a] / [FLAT.r, FLAT.g, FLAT.b][a] + em[a] / [FLAT.r, FLAT.g, FLAT.b][a];
          // (the finish: lit as flat ground, roughly)
          outCol.push(srgb(Math.min(1, c * [FLAT.r, FLAT.g, FLAT.b][a])));
        }
        outCol.push(flags & 1 ? opacity : 1);
        outUv.push(tex >= 0 ? uv[i * 2] : 0, tex >= 0 ? uv[i * 2 + 1] : 0);
      }
      for (const k of idx) outIdx.push(at + k);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(outCol, 4));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
    geo.setIndex(outIdx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, map: tex >= 0 ? texes[tex] : null, transparent: !!(flags & 1) });
    scene.add(new THREE.Mesh(geo, mat));
  };
  for (let p = 0; p < partCount; p++) {
    const part = readPart();
    const n = int();
    const places = [];
    for (let k = 0; k < n; k++) places.push(readPlace());
    build(part, places);
  }
  // what moves, at frame f (&f=): each copy where its track is then (world = track x its place on it)
  const half = (at: number) => {
    const h = dv.getUint16(at, true);
    const e = (h >> 10) & 31, m = h & 1023, sg = h & 0x8000 ? -1 : 1;
    return e === 0 ? sg * m * 2 ** -24 : sg * (1 + m / 1024) * 2 ** (e - 15);
  };
  const frameAt = Number(q.get('f') ?? 0);
  const tracks: (THREE.Matrix4 | null)[] = [];
  const trackCount = int(); flt(); const frames = int();
  for (let t = 0; t < trackCount; t++) {
    const origin = [flt(), flt(), flt()];
    const at = o + (frameAt % frames) * 24;
    const v = Array.from({ length: 12 }, (_, i) => half(at + i * 2));
    o += frames * 24;
    tracks.push(v.slice(3).every((x) => x === 0) ? null : new THREE.Matrix4().set(v[3], v[4], v[5], origin[0] + v[0], v[6], v[7], v[8], origin[1] + v[1], v[9], v[10], v[11], origin[2] + v[2], 0, 0, 0, 1));
  }
  const moverParts = int();
  for (let p = 0; p < moverParts; p++) {
    const part = readPart();
    const n = int();
    const places = [];
    for (let k = 0; k < n; k++) {
      const t = int();
      const pl = readPlace();
      if (tracks[t]) places.push({ m: tracks[t]!.clone().multiply(pl.m), tint: pl.tint });
    }
    build(part, places);
  }
  const x = Number(q.get('x') ?? meta.samples.x[0]) / 16, y = Number(q.get('y') ?? meta.samples.y[0]) / 16;
  const d = Number(q.get('d') ?? 29);
  const pitch = (52 * Math.PI) / 180;
  const cam = new THREE.PerspectiveCamera(26, 1280 / 720, 0.5, 4000);
  // north up: the camera south of the point, looking north and down (three: north is -z, the map's y down is +z)
  cam.position.set(x, Math.sin(pitch) * d, y + Math.cos(pitch) * d);
  cam.lookAt(x, 0, y);
  renderer.render(scene, cam);
  window.previewReady = true;
}
main();
