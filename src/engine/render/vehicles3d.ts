// The F1 car in 3D: a low-poly open-wheel racer in its team paint, which
// darkens as the car burns.

import * as THREE from 'three';
import { carClass, type CarClassId } from '../driving';

const lambert = (extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial(extra);

/** How the second colour runs over the top of the car, so a team reads by shape as well as colour. */
export type LiveryPattern = 'plain' | 'stripe' | 'twin' | 'band' | 'chevron' | 'halves' | 'split' | 'nose';

export interface CarLook {
  body: string;
  /** wings and nose, and the pattern's colour */
  stripe?: string;
  /** sidepods (the body colour when unset) */
  accent?: string;
  /** the pattern painted along the top of the car */
  pattern?: LiveryPattern;
  /**
   * the T-camera on top of the air intake: dark on a team's first car, bright
   * green on its second, so teammates tell apart (carbon when unset)
   */
  tcam?: string;
  /** the driver's helmet: plain white unless set; 'gold' is shiny metallic gold (the player's) */
  helmet?: string | 'gold';
}

/**
 * Paint `pattern` into a w x h canvas: body colour, with the second colour as a
 * stripe, twin stripes, bands, chevrons, halves, a split or a coloured nose.
 * The canvas top is the front of the car.
 */
function paintPattern(w: number, h: number, pattern: LiveryPattern, body: string, second: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = body;
  x.fillRect(0, 0, w, h);
  x.fillStyle = second;
  switch (pattern) {
    case 'stripe':
      x.fillRect(w * 0.36, 0, w * 0.28, h);
      break;
    case 'twin':
      x.fillRect(w * 0.14, 0, w * 0.18, h);
      x.fillRect(w * 0.68, 0, w * 0.18, h);
      break;
    case 'band':
      for (let y = h * 0.12; y < h; y += h * 0.3) x.fillRect(0, y, w, h * 0.12);
      break;
    case 'chevron':
      x.lineWidth = Math.max(2, w * 0.18);
      x.strokeStyle = second;
      for (let y = h * 0.2; y < h + w; y += h * 0.34) {
        x.beginPath();
        x.moveTo(0, y + w * 0.5);
        x.lineTo(w / 2, y);
        x.lineTo(w, y + w * 0.5);
        x.stroke();
      }
      break;
    case 'halves':
      x.fillRect(0, 0, w, h / 2);
      break;
    case 'split':
      x.fillRect(w / 2, 0, w / 2, h);
      break;
    case 'nose':
      x.fillRect(0, 0, w, h * 0.34);
      break;
    case 'plain':
      break;
  }
  return c;
}

/** A crisp texture from a canvas. */
function canvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The engine-cover texture (`w` x `h` world px): the pattern, 8 texels to a world px. */
function deckTexture(look: CarLook, second: string, w: number, h: number): THREE.CanvasTexture {
  return canvasTexture(paintPattern(Math.round(w * 8), Math.round(h * 8), look.pattern ?? 'plain', look.body, second));
}

export const CAR_LOOKS: Record<CarClassId, CarLook> = {
  f1: { body: '#d8323c', stripe: '#f4f4f8' },
};

export interface CarMesh extends THREE.Group {
  userData: {
    /** materials whose colour darkens as the car burns */
    paint: THREE.MeshLambertMaterial[];
    /** the coloured band round each tyre's outer edge, marking its compound: set its colour */
    tyreMark: THREE.MeshBasicMaterial;
    /** the red rain light at the back, for wet races: off (hidden) until shown */
    rainLight: THREE.Mesh;
  };
}

/**
 * The car facing north (−z): a narrow tub with a long nose, sidepods, cockpit
 * and helmet, front and rear wings, and fat exposed tyres (bigger at the back).
 */
export function createCarMesh(id: CarClassId, livery?: string | Partial<CarLook>): CarMesh {
  // a colour paints the body; a livery can set the trim and sidepods too
  const look: CarLook = { ...CAR_LOOKS[id], ...(typeof livery === 'string' ? { body: livery } : livery) };
  const { width: W, length: L } = carClass(id);
  const car = new THREE.Group() as CarMesh;
  const paint: THREE.MeshLambertMaterial[] = [];
  const mat = (color: THREE.ColorRepresentation) => {
    const m = lambert({ color });
    paint.push(m);
    return m;
  };
  const dark = lambert({ color: 0x111111 });
  // BoxGeometry faces: +x, −x, +y, −y, +z (back), −z (front)
  const box = (w: number, h: number, l: number, y: number, z: number, faces: THREE.Material[]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), faces);
    m.position.set(0, y, z);
    m.castShadow = m.receiveShadow = true;
    car.add(m);
    return m;
  };

  const body = mat(look.body);
  const second = look.stripe ?? '#f4f4f8';
  const trim = mat(second);
  const pods = look.accent ? mat(look.accent) : body;
  const carbon = lambert({ color: 0x1b1b26 });
  // textured paint (white, so the texture shows as drawn; it still chars when the car burns)
  const painted = (tex: THREE.Texture) => {
    const m = lambert({ map: tex, color: 0xffffff });
    paint.push(m);
    return m;
  };
  // the pattern along the top of the tub, from the nose back
  const tubTop = look.pattern && look.pattern !== 'plain' ? painted(canvasTexture(paintPattern(8, 48, look.pattern, look.body, second))) : body;
  box(5, 3.5, L - 6, 3.5, 1, [body, body, tubTop, dark, body, body]); // tub
  box(3, 2.5, 8, 3, -(L / 2 - 6), [body, body, trim, dark, body, body]); // nose
  for (const x of [-4, 4]) {
    const pod = box(3, 3, 9, 3, 3, [pods, pods, pods, dark, pods, pods]);
    pod.position.x = x;
  }
  box(3.5, 1.5, 5, 5.8, 0, [carbon, carbon, carbon, dark, carbon, carbon]); // cockpit
  // the engine cover, spanning the sidepods behind the cockpit: the biggest surface seen from above,
  // carrying the team's pattern
  if (look.pattern) box(11, 0.6, 8, 5.4, 7, [pods, pods, painted(deckTexture(look, second, 11, 8)), dark, pods, pods]);
  // the air intake above the driver's head, and the T-camera on it: dark, or bright green to mark the
  // team's second car (unlit, so it stays bright in shade and from afar)
  box(2.6, 2.4, 3, 7.6, 2.6, [body, body, body, dark, body, carbon]);
  const tcam = look.tcam ? new THREE.MeshBasicMaterial({ color: look.tcam, toneMapped: false }) : carbon;
  box(4.2, 1, 1.6, 9.3, 2.4, [tcam, tcam, tcam, dark, tcam, tcam]);
  // (the gold one shines: a bright highlight where the sun catches it, and a warm glow of its own)
  const helmetMat =
    look.helmet === 'gold'
      ? new THREE.MeshPhongMaterial({ color: 0xf5b82e, specular: 0xfff4c8, shininess: 90, emissive: 0x4a3000 })
      : mat(look.helmet ?? '#e8e8ee');
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 10), helmetMat);
  helmet.position.set(0, 7.2, 0.5);
  helmet.castShadow = true;
  car.add(helmet);
  box(W, 0.8, 3, 1.4, -(L / 2 - 1.5), [trim, trim, trim, dark, trim, trim]); // front wing
  box(W - 3, 0.8, 2.5, 8.5, L / 2 - 1.5, [trim, trim, body, dark, trim, trim]); // rear wing
  for (const x of [-(W - 3) / 2, (W - 3) / 2]) {
    const plate = box(0.6, 5, 3, 6.5, L / 2 - 1.5, [carbon, carbon, carbon, carbon, carbon, carbon]);
    plate.position.x = x;
  }

  // wheels: [z, radius, tyre width, half-track] per axle
  const axles: [number, number, number, number][] = [
    [-(L / 2 - 8), 3.2, 3, W / 2 - 1.5],
    [L / 2 - 6, 3.8, 3.6, W / 2 - 1.2],
  ];
  const wheelMat = lambert({ color: 0x151515 });
  // the compound's colour round the outer edge of each tread (unlit, so it reads from afar and in shade)
  const tyreMark = new THREE.MeshBasicMaterial({ color: 0xffd21f, toneMapped: false });
  for (const [z, wr, ww, half] of axles) {
    for (const x of [-half, half]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, ww, 12), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, wr, z);
      car.add(wheel);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(wr + 0.12, wr + 0.12, 0.8, 12, 1, true), tyreMark);
      band.rotation.z = Math.PI / 2;
      band.position.set(x + Math.sign(x) * (ww / 2 - 0.4), wr, z);
      car.add(band);
    }
  }

  // the rain light: a red lamp at the back, under the rear wing (unlit, so it glows; the bloom picks it up)
  const rainLight = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2, 1), new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }));
  rainLight.position.set(0, 4.2, L / 2 - 0.2);
  rainLight.visible = false;
  car.add(rainLight);

  car.userData = { paint, tyreMark, rainLight };
  return car;
}
