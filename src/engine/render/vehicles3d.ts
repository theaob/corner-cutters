// The F1 car in 3D: a low-poly open-wheel racer in its team paint, which
// darkens as the car burns.

import * as THREE from 'three';
import { carClass, type CarClassId } from '../driving';

const lambert = (extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial(extra);

export interface CarLook {
  body: string;
  /** wings and nose */
  stripe?: string;
  /** sidepods (the body colour when unset) */
  accent?: string;
}

export const CAR_LOOKS: Record<CarClassId, CarLook> = {
  f1: { body: '#d8323c', stripe: '#f4f4f8' },
};

export interface CarMesh extends THREE.Group {
  userData: {
    /** materials whose colour darkens as the car burns */
    paint: THREE.MeshLambertMaterial[];
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
  const trim = mat(look.stripe ?? '#f4f4f8');
  const pods = look.accent ? mat(look.accent) : body;
  const carbon = lambert({ color: 0x1b1b26 });
  box(5, 3.5, L - 6, 3.5, 1, [body, body, body, dark, body, body]); // tub
  box(3, 2.5, 8, 3, -(L / 2 - 6), [body, body, trim, dark, body, body]); // nose
  for (const x of [-4, 4]) {
    const pod = box(3, 3, 9, 3, 3, [pods, pods, pods, dark, pods, pods]);
    pod.position.x = x;
  }
  box(3.5, 1.5, 5, 5.8, 0, [carbon, carbon, carbon, dark, carbon, carbon]); // cockpit
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), mat('#f2c14e'));
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
  for (const [z, wr, ww, half] of axles) {
    for (const x of [-half, half]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, ww, 12), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, wr, z);
      car.add(wheel);
    }
  }

  car.userData = { paint };
  return car;
}
