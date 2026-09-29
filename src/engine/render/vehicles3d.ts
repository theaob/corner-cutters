// Vehicles in 3D: every car class as a low-poly model with pixel-art panels,
// working headlights and tail lights (stop lights when braking), cop light
// bars, and paint that darkens as a car burns. Shared by every game.

import * as THREE from 'three';
import { canvas, carSprite } from './sprites';
import { pixelTexture } from './textures';
import { carClass, type CarClassId } from '../driving';

const lambert = (tex: THREE.Texture | null, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ map: tex, ...extra });

let spotTex: THREE.Texture | undefined;

/** A soft round glow, for light pools and beams. */
export function spotTexture(): THREE.Texture {
  if (spotTex) return spotTex;
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  spotTex = new THREE.CanvasTexture(c);
  spotTex.colorSpace = THREE.SRGBColorSpace;
  return spotTex;
}

type VehicleStyle = 'car' | 'van' | 'bus' | 'truck' | 'pickup' | 'offroad' | 'tractor' | 'combine' | 'f1';

export interface CarLook {
  style: VehicleStyle;
  body: string;
  stripe?: string;
  cop?: boolean;
  taxi?: boolean;
  /** lower body and cabin */
  low?: boolean;
}

export const CAR_LOOKS: Record<CarClassId, CarLook> = {
  sedan: { style: 'car', body: '#f08a24', stripe: '#1b1b26' },
  taxi: { style: 'car', body: '#f2c14e', stripe: '#1b1b26', taxi: true },
  muscle: { style: 'car', body: '#8a3cc8', stripe: '#5fe0d0' },
  sports: { style: 'car', body: '#d8323c', stripe: '#f4f4f8', low: true },
  cop: { style: 'car', body: '#f4f4f8', cop: true },
  van: { style: 'van', body: '#e9e5dc', stripe: '#3d7fc4' },
  trash: { style: 'truck', body: '#4f8a4a' },
  bus: { style: 'bus', body: '#3d7fc4', stripe: '#f2c14e' },
  pickup: { style: 'pickup', body: '#a8302a' },
  offroad: { style: 'offroad', body: '#5b7a3a' },
  tractor: { style: 'tractor', body: '#3f9a4c' },
  combine: { style: 'combine', body: '#e9c46a' },
  f1: { style: 'f1', body: '#d8323c', stripe: '#f4f4f8' },
};

export interface CarMesh extends THREE.Group {
  userData: {
    /** materials whose colour darkens as the car burns */
    paint: THREE.MeshLambertMaterial[];
    /** red/blue light bar pieces on cop cars */
    lightbar: THREE.Mesh[];
    /** headlamps, tail lights and the headlight beams: hide when parked or wrecked */
    lights: THREE.Group;
    /** this car's own tail-light materials (they brighten when it brakes); absent on cars without lights */
    tail?: { lamp: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial };
  };
}

// Headlamps and beams share materials, so one call dims or brightens every car;
// tail lights are per car, since they also work as stop lights.
const HEADLAMP = new THREE.MeshBasicMaterial({ color: 0xe8e0b8, toneMapped: false });
const TAIL_DAY = new THREE.Color(0.45, 0.08, 0.08);
let beamMat: THREE.MeshBasicMaterial | undefined;
/** current night level, 0 … 1 */
let vehicleNight = 0;

/** The headlight beam on the ground: narrow at the car, widening and fading ahead (canvas top = far end). */
function beamMaterial(): THREE.MeshBasicMaterial {
  if (beamMat) return beamMat;
  const W = 64;
  const H = 128;
  const [c, x] = canvas(W, H);
  const img = x.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    const along = 1 - py / (H - 1);
    const half = (0.2 + 0.8 * along) * 0.5;
    const fall = Math.pow(1 - along, 1.2) * Math.min(1, along * 8 + 0.3);
    for (let px = 0; px < W; px++) {
      const u = Math.abs(px / (W - 1) - 0.5);
      const edge = Math.max(0, Math.min(1, (half - u) / (half * 0.35)));
      const a = Math.round(255 * fall * edge);
      const o = (py * W + px) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = a;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  beamMat = new THREE.MeshBasicMaterial({ map: t, color: 0xfff0c8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, visible: false });
  return beamMat;
}

/** Night level (0 … 1) for every vehicle's lights: headlamps and tail lights brighten, beams fade in. */
export function setVehicleLights(level: number): void {
  vehicleNight = level;
  HEADLAMP.color.setRGB(0.9 + 2.2 * level, 0.88 + 2.1 * level, 0.72 + 1.5 * level);
  const beam = beamMaterial();
  beam.opacity = level * 0.36;
  beam.visible = level > 0.01;
}

/**
 * A car's tail lights for this frame: lit red at night, and brighter (with a
 * red glow on the road behind) whenever it brakes, day or night.
 */
export function setTailLights(car: CarMesh, braking: boolean): void {
  const tail = car.userData.tail;
  if (!tail) return;
  const n = vehicleNight;
  if (braking) tail.lamp.color.setRGB(3.2, 0.3, 0.22);
  else tail.lamp.color.setRGB(TAIL_DAY.r + 1.6 * n, TAIL_DAY.g + 0.08 * n, TAIL_DAY.b + 0.08 * n);
  tail.glow.opacity = n * 0.3 + (braking ? 0.2 + n * 0.4 : 0);
  tail.glow.visible = tail.glow.opacity > 0.01;
}

/** A side panel: body colour, an optional stripe, and a strip of windows (or one window near the front). */
function sidePanel(len: number, h: number, look: CarLook, windows: 'strip' | 'front' | 'none', frontAtRight: boolean): HTMLCanvasElement {
  const [c, x] = canvas(len, h);
  x.fillStyle = look.body;
  x.fillRect(0, 0, len, h);
  x.fillStyle = 'rgba(0,0,0,.25)';
  x.fillRect(0, h - 2, len, 2);
  if (look.stripe) {
    x.fillStyle = look.stripe;
    x.fillRect(0, h - 5, len, 2);
  }
  x.fillStyle = '#2e3b5c';
  if (windows === 'strip') {
    for (let i = 3; i + 5 < len - 2; i += 7) x.fillRect(i, 2, 5, Math.max(3, h * 0.35));
  } else if (windows === 'front') {
    const w = Math.round(len * 0.25);
    x.fillRect(frontAtRight ? len - w - 1 : 1, 2, w, Math.max(3, h * 0.4));
  }
  return c;
}

/** Roof seen from above (canvas top = the front): rim, windscreen edge and some kit per style. */
function roofPanel(w: number, l: number, look: CarLook, kind: 'van' | 'bus' | 'container'): HTMLCanvasElement {
  const [c, x] = canvas(w, l);
  const base = new THREE.Color(look.body);
  const hex = (col: THREE.Color) => `#${col.getHexString()}`;
  x.fillStyle = hex(kind === 'container' ? base.clone().multiplyScalar(0.85) : base.clone().lerp(new THREE.Color('#ffffff'), 0.25));
  x.fillRect(0, 0, w, l);
  x.fillStyle = hex(base.clone().multiplyScalar(0.6));
  x.fillRect(0, 0, w, 1);
  x.fillRect(0, l - 1, w, 1);
  x.fillRect(0, 0, 1, l);
  x.fillRect(w - 1, 0, 1, l);
  if (kind === 'container') {
    for (let y = 3; y < l - 2; y += 4) x.fillRect(1, y, w - 2, 1);
    x.fillStyle = '#f2c14e';
    x.fillRect(1, l - 3, w - 2, 1);
    return c;
  }
  // windscreen edge at the front
  x.fillStyle = '#6d86b8';
  x.fillRect(1, 1, w - 2, 2);
  if (kind === 'bus') {
    if (look.stripe) {
      x.fillStyle = look.stripe;
      x.fillRect(1, 4, w - 2, 1);
    }
    for (const y of [Math.round(l * 0.3), Math.round(l * 0.65)]) {
      x.fillStyle = '#8e929c';
      x.fillRect(4, y, w - 8, 6);
      x.fillStyle = '#6c707a';
      x.fillRect(5, y + 2, w - 10, 1);
      x.fillRect(5, y + 4, w - 10, 1);
    }
  } else {
    // roof rack
    x.fillStyle = '#5a5e68';
    for (const y of [Math.round(l * 0.35), Math.round(l * 0.55), Math.round(l * 0.75)]) x.fillRect(2, y, w - 4, 1);
    x.fillRect(2, Math.round(l * 0.35), 1, Math.round(l * 0.4) + 1);
    x.fillRect(w - 3, Math.round(l * 0.35), 1, Math.round(l * 0.4) + 1);
    if (look.stripe) {
      x.fillStyle = look.stripe;
      x.fillRect(Math.round(w / 2) - 1, 4, 2, Math.round(l * 0.25));
    }
  }
  return c;
}

/** Front or back face: body colour with a windscreen band. */
function endPanel(w: number, h: number, look: CarLook, glass: boolean): HTMLCanvasElement {
  const [c, x] = canvas(w, h);
  x.fillStyle = look.body;
  x.fillRect(0, 0, w, h);
  if (glass) {
    x.fillStyle = '#6d86b8';
    x.fillRect(1, 1, w - 2, Math.max(2, Math.round(h * 0.45)));
  }
  x.fillStyle = '#fff6c2';
  x.fillRect(1, h - 3, 2, 1);
  x.fillRect(w - 3, h - 3, 2, 1);
  return c;
}

/**
 * A boxy vehicle of the given class, facing north (−z): cars get a body with a
 * pixel-art top and a cabin; vans, buses and trash trucks are tall boxes with
 * painted sides.
 */
export function createCarMesh(id: CarClassId, color?: string): CarMesh {
  const look = color ? { ...CAR_LOOKS[id], body: color } : CAR_LOOKS[id];
  const { width: W, length: L } = carClass(id);
  const car = new THREE.Group() as CarMesh;
  const paint: THREE.MeshLambertMaterial[] = [];
  const mat = (tex: THREE.Texture | null, color?: THREE.ColorRepresentation) => {
    const m = lambert(tex, color === undefined ? {} : { color });
    paint.push(m);
    return m;
  };
  const dark = lambert(null, { color: 0x111111 });
  const box = (w: number, h: number, l: number, y: number, z: number, faces: THREE.Material[]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), faces);
    m.position.set(0, y, z);
    m.castShadow = m.receiveShadow = true;
    car.add(m);
    return m;
  };
  // BoxGeometry faces: +x, −x, +y, −y, +z (back), −z (front). On +x the front is at the right of the texture.
  const tex = (c: HTMLCanvasElement) => pixelTexture(c);

  if (look.style === 'car') {
    const h = look.low ? 5 : 6;
    const side = new THREE.Color(look.cop ? '#1b1b26' : look.body).multiplyScalar(0.8);
    const top = mat(tex(carSprite(look.body, look.stripe)));
    box(W, h, L, h / 2 + 2, 0, [mat(null, side), mat(null, side), top, dark, mat(null, side), mat(null, side)]);
    const roof = mat(null, look.cop ? '#f4f4f8' : look.body);
    const glass = lambert(null, { color: 0x2e3b5c });
    const screen = lambert(null, { color: 0x6d86b8 });
    const ch = look.low ? 3 : 4;
    const cl = Math.round(L * (look.low ? 0.36 : 0.42));
    box(W - 3, ch, cl, h + 2 + ch / 2, 1, [glass, glass, roof, dark, screen, screen]);
    if (look.taxi) {
      box(6, 2, 3, h + 2 + ch + 1, 1, [mat(null, '#fff6c2'), mat(null, '#fff6c2'), mat(null, '#f2c14e'), dark, mat(null, '#1b1b26'), mat(null, '#1b1b26')]);
    }
  } else if (look.style === 'van' || look.style === 'bus') {
    const h = look.style === 'bus' ? 16 : 12;
    const windows = look.style === 'bus' ? 'strip' : 'front';
    const roof = mat(tex(roofPanel(W, L, look, look.style)));
    box(W, h, L, h / 2 + 2, 0, [
      mat(tex(sidePanel(L, h, look, windows, true))),
      mat(tex(sidePanel(L, h, look, windows, false))),
      roof,
      dark,
      mat(tex(endPanel(W, h, look, look.style === 'bus'))),
      mat(tex(endPanel(W, h, look, true))),
    ]);
  } else if (look.style === 'pickup' || look.style === 'offroad') {
    const h = look.style === 'offroad' ? 8 : 6;
    const lift = look.style === 'offroad' ? 4 : 2;
    const side = mat(null, new THREE.Color(look.body).multiplyScalar(0.8));
    const top = mat(null, look.body);
    const glass = lambert(null, { color: 0x2e3b5c });
    const screen = lambert(null, { color: 0x6d86b8 });
    // lower body the full length
    box(W, h, L, h / 2 + lift, 0, [side, side, top, dark, side, side]);
    if (look.style === 'pickup') {
      // cab over the front half; the rear is an open bed with a dark floor
      const cabL = Math.round(L * 0.4);
      box(W - 2, 5, cabL, h + lift + 2.5, -(L / 2 - cabL / 2 - 2), [glass, glass, mat(null, look.body), dark, screen, screen]);
      const bedL = L - cabL - 5;
      box(W - 4, 0.5, bedL, h + lift + 0.3, L / 2 - bedL / 2 - 1, [dark, dark, lambert(null, { color: 0x3a2c24 }), dark, dark, dark]);
    } else {
      // tall cabin with a roll bar and a spare tyre on the back
      box(W - 2, 5, Math.round(L * 0.55), h + lift + 2.5, 1, [glass, glass, mat(null, look.body), dark, screen, screen]);
      box(W - 1, 1, 2, h + lift + 5.5, Math.round(L * 0.3), [dark, dark, dark, dark, dark, dark]);
      const spare = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 2, 10), lambert(null, { color: 0x151515 }));
      spare.rotation.x = Math.PI / 2;
      spare.position.set(0, h / 2 + lift + 1, L / 2 + 1);
      car.add(spare);
    }
  } else if (look.style === 'tractor') {
    // engine hood at the front, open cab with a roof over the rear axle, exhaust stack
    const green = mat(null, look.body);
    const hoodL = Math.round(L * 0.5);
    box(W - 6, 7, hoodL, 7.5, -(L / 2 - hoodL / 2), [green, green, green, dark, green, green]);
    const cabL = L - hoodL;
    const glass = lambert(null, { color: 0x6d86b8, transparent: true, opacity: 0.6 });
    box(W - 4, 9, cabL - 2, 12, L / 2 - cabL / 2, [glass, glass, mat(null, '#f4f4f8'), dark, glass, glass]);
    box(W - 3, 1, cabL, 17, L / 2 - cabL / 2, [green, green, mat(null, '#f4f4f8'), dark, green, green]);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 8, 6), dark);
    stack.position.set(W / 2 - 5, 14, -(L / 2 - 5));
    car.add(stack);
  } else if (look.style === 'combine') {
    // wide cutter header at the front, cab above it, big body with a grain tank, unloading pipe
    const yellow = mat(null, look.body);
    const yellowDark = mat(null, new THREE.Color(look.body).multiplyScalar(0.75));
    const headL = 8;
    box(W, 4, headL, 4, -(L / 2 - headL / 2), [yellowDark, yellowDark, mat(null, '#b8bcc6'), dark, yellowDark, dark]);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, W - 2, 10), mat(null, '#c8323c'));
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0, 8, -(L / 2 - 4));
    car.add(reel);
    const bodyW = W - 10;
    const bodyL = L - headL - 2;
    box(bodyW, 14, bodyL, 11, L / 2 - bodyL / 2, [yellow, yellow, mat(tex(roofPanel(bodyW, bodyL, look, 'container'))), dark, yellow, yellowDark]);
    const glass = lambert(null, { color: 0x6d86b8 });
    box(bodyW - 4, 7, 8, 21.5, -(L / 2 - headL - 6), [glass, glass, mat(null, '#f4f4f8'), dark, glass, glass]);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 16, 6), yellowDark);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(bodyW / 2 + 6, 17, 6);
    car.add(pipe);
  } else if (look.style === 'f1') {
    // open-wheel racer: narrow tub with a long nose, sidepods, cockpit and helmet, front and rear wings
    const paint = mat(null, look.body);
    const trim = mat(null, look.stripe ?? '#f4f4f8');
    const carbon = lambert(null, { color: 0x1b1b26 });
    box(5, 3.5, L - 6, 3.5, 1, [paint, paint, paint, dark, paint, paint]); // tub
    box(3, 2.5, 8, 3, -(L / 2 - 6), [paint, paint, trim, dark, paint, paint]); // nose
    for (const x of [-4, 4]) {
      const pod = box(3, 3, 9, 3, 3, [paint, paint, paint, dark, paint, paint]);
      pod.position.x = x;
    }
    box(3.5, 1.5, 5, 5.8, 0, [carbon, carbon, carbon, dark, carbon, carbon]); // cockpit
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), mat(null, '#f2c14e'));
    helmet.position.set(0, 7.2, 0.5);
    helmet.castShadow = true;
    car.add(helmet);
    box(W, 0.8, 3, 1.4, -(L / 2 - 1.5), [trim, trim, trim, dark, trim, trim]); // front wing
    box(W - 3, 0.8, 2.5, 8.5, L / 2 - 1.5, [trim, trim, paint, dark, trim, trim]); // rear wing
    for (const x of [-(W - 3) / 2, (W - 3) / 2]) {
      const plate = box(0.6, 5, 3, 6.5, L / 2 - 1.5, [carbon, carbon, carbon, carbon, carbon, carbon]);
      plate.position.x = x;
    }
  } else {
    // trash truck: cab at the front, big container behind
    const cabL = Math.round(L * 0.3);
    const boxL = L - cabL - 1;
    const cab = mat(null, '#f4f4f8');
    box(W, 10, cabL, 7, -(L / 2 - cabL / 2), [cab, cab, cab, dark, cab, mat(tex(endPanel(W, 10, { ...look, body: '#f4f4f8' }, true)))]);
    const body = mat(tex(sidePanel(boxL, 14, { ...look, stripe: '#f2c14e' }, 'none', true)));
    box(W, 14, boxL, 9, L / 2 - boxL / 2, [body, mat(tex(sidePanel(boxL, 14, { ...look, stripe: '#f2c14e' }, 'none', false))), mat(tex(roofPanel(W, boxL, look, 'container'))), dark, mat(tex(endPanel(W, 14, look, false))), mat(null, look.body)]);
  }

  // wheels: [z, radius, tyre width, half-track] per axle
  const r = look.style === 'car' || look.style === 'pickup' ? 3 : 4;
  let axles: [number, number, number, number][] = [
    [-(L / 2 - r - 2), r, 2, W / 2],
    [L / 2 - r - 2, r, 2, W / 2],
  ];
  if (L > 40 && look.style !== 'combine') axles.push([L / 2 - r * 3 - 3, r, 2, W / 2]);
  if (look.style === 'offroad') axles = axles.map(([z]) => [z, 5, 3, W / 2]);
  // tractor: small steering wheels at the front, huge drive wheels at the back
  if (look.style === 'tractor') axles = [[-(L / 2 - 4), 3.5, 2, W / 2 - 3], [L / 2 - 7, 7, 4, W / 2]];
  // combine: big drive wheels under the front of the body, small steering wheels at the back
  if (look.style === 'combine') axles = [[-(L / 2 - 16), 7, 4, (W - 10) / 2 + 2], [L / 2 - 5, 4, 3, (W - 10) / 2]];
  // F1: fat exposed tyres outside the body, bigger at the back
  if (look.style === 'f1') axles = [[-(L / 2 - 8), 3.2, 3, W / 2 - 1.5], [L / 2 - 6, 3.8, 3.6, W / 2 - 1.2]];
  const wheelMat = lambert(null, { color: 0x151515 });
  for (const [z, wr, ww, half] of axles) {
    for (const x of [-half, half]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, ww, 12), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, wr, z);
      car.add(wheel);
    }
  }

  // lights: headlamps at the front corners, each with its own beam on the road ahead; tail lights
  // on the rear top edge (so they show from the tilted camera whichever way the car faces)
  const lights = new THREE.Group();
  let tail: CarMesh['userData']['tail'];
  if (look.style !== 'f1' && look.style !== 'combine') {
    const y = look.style === 'tractor' ? 7 : look.style === 'offroad' ? 7 : 4.5;
    /** height of the body's top at the back */
    const rearTop: Record<string, number> = { car: look.low ? 7 : 8, van: 14, bus: 18, pickup: 8, offroad: 12, tractor: 9, truck: 16 };
    const top = rearTop[look.style] ?? 8;
    const headGeo = new THREE.BoxGeometry(2.5, 1.5, 0.6);
    const tailGeo = new THREE.BoxGeometry(3, 1.2, 1.6);
    const lamp = new THREE.MeshBasicMaterial({ color: TAIL_DAY, toneMapped: false });
    const glow = new THREE.MeshBasicMaterial({ map: spotTexture(), color: 0xff2a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, visible: false });
    tail = { lamp, glow };
    const reach = 80;
    const beamW = Math.max(20, W * 1.5);
    const beamGeo = new THREE.PlaneGeometry(beamW, reach).rotateX(-Math.PI / 2).translate(0, 0, -reach / 2);
    for (const side of [-1, 1]) {
      const x = side * (W / 2 - 2);
      const head = new THREE.Mesh(headGeo, HEADLAMP);
      head.position.set(x, y, -L / 2 - 0.3);
      const back = new THREE.Mesh(tailGeo, lamp);
      back.position.set(x, top - 0.5, L / 2 - 0.6);
      // one beam per headlamp, splayed slightly outwards
      const beam = new THREE.Mesh(beamGeo, beamMaterial());
      beam.position.set(x, 0.45, -L / 2 + 1);
      beam.rotation.y = -side * 0.07;
      beam.renderOrder = 1;
      lights.add(head, back, beam);
    }
    const red = new THREE.Mesh(new THREE.PlaneGeometry(W + 12, 18).rotateX(-Math.PI / 2), glow);
    red.position.set(0, 0.4, L / 2 + 6);
    red.renderOrder = 1;
    lights.add(red);
  }
  car.add(lights);

  const lightbar: THREE.Mesh[] = [];
  if (look.cop) {
    for (const [x, color] of [[-2.5, 0xff3b3b], [2.5, 0x3b7bff]] as const) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 3), new THREE.MeshBasicMaterial({ color }));
      l.position.set(x, 12.8, 1);
      car.add(l);
      lightbar.push(l);
    }
  }
  car.userData = { paint, lightbar, lights, tail };
  return car;
}
