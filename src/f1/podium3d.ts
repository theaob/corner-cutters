// The champagne ceremony: a three-step podium beside the main straight, the
// top three drivers on it in their teams' colours (the winner on the top step,
// second on its left, third on its right), bouncing with their arms up, then
// spraying champagne (golden jets arcing out of each bottle, the winner's at
// the others) while confetti falls. Built once and shown at the end of the race.
// At a circuit whose podium hangs over the main straight (layout.podiumDeck),
// it stands up on that deck, the crowd flooding the track below it.

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import { HALF_WIDTH, type Circuit } from './circuit';
import { GARAGE_ACROSS, PIT } from './pits';

export interface PodiumDriver {
  /** the team's colours: overalls and trim */
  body: string;
  trim: string;
  /** the helmet: gold for you */
  helmet: string;
}

export interface Ceremony {
  group: THREE.Group;
  /** Dress the top three (winner first). */
  setDrivers(drivers: PodiumDriver[]): void;
  /** Animate: `t` seconds since the ceremony began, `dt` since the last frame. */
  update(t: number, dt: number): void;
  /** Where the camera should look (the top step), in the group's space. */
  focus: THREE.Vector3;
}

/** px: each step's height (P1, P2, P3) and size, the gap between the steps' centres */
const STEP = [16, 11, 7];
const STEP_W = 16;
const STEP_D = 14;
/** x of each place's step: P1 in the middle, P2 to its left, P3 to its right */
const PLACE_X = [0, -STEP_W, STEP_W];
const TOPS = [0xf2c14e, 0xc9ccd4, 0xc98a4b];

const DROPS = 260;
const CONFETTI = 140;

/** px: the deck reaches from behind the garages to this far past the centreline, away from the pits, and runs this far along the track */
const DECK = { tip: 14, back: GARAGE_ACROSS + 24, along: 84, thick: 8 };
/** tifosi on the track below a hanging podium */
const TIFOSI = 220;
/** one in this many waves a flag */
const FLAG_EVERY = 5;

/** The podium's steps, white topped in gold, silver and bronze, with a dark backboard behind them (facing +z). */
function podiumSteps(): THREE.Group {
  const group = new THREE.Group();
  const lambert = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
  STEP.forEach((h, k) => {
    const step = new THREE.Mesh(new THREE.BoxGeometry(STEP_W, h, STEP_D), [lambert(0xe8e8ee), lambert(0xe8e8ee), lambert(TOPS[k]), lambert(0xe8e8ee), lambert(0xf4f4f8), lambert(0xe8e8ee)]);
    step.position.set(PLACE_X[k], h / 2, 0);
    step.castShadow = step.receiveShadow = true;
    group.add(step);
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(STEP_W * 3 + 10, 34, 2), lambert(0x1b1b26));
  board.position.set(0, 17, -STEP_D / 2 - 3);
  board.castShadow = true;
  group.add(board);
  return group;
}

/**
 * Where the ceremony stands: on the run-off across the straight from the top
 * three's parking spots, or, at a circuit with a podium deck, up on the deck
 * over the middle of the track (`raise` px above the ground).
 */
export function podiumSpot(circuit: Circuit): { x: number; y: number; h: number; raise: number } {
  const { track, pit, grid, layout } = circuit;
  const at = track.samples[pit.podium[1].idx];
  const lat = layout.podiumDeck ? 0 : -pit.side * (HALF_WIDTH + 34);
  const x = at.x + Math.cos(at.dir) * lat;
  const y = at.y + Math.sin(at.dir) * lat;
  return { x, y, h: groundAt(grid, x, y).h, raise: layout.podiumDeck ?? 0 };
}

/**
 * The podium deck (for a circuit with one): a slab hanging out over the main
 * straight from a tower behind the garages, a glass rail round it and a red
 * fascia toward the camera, and the steel beams under it.
 */
export function createPodiumDeck(circuit: Circuit): THREE.Group | undefined {
  const raise = circuit.layout.podiumDeck;
  if (!raise) return undefined;
  const { track, pit } = circuit;
  const spot = podiumSpot(circuit);
  const at = track.samples[pit.podium[1].idx];
  const group = new THREE.Group();
  group.position.set(spot.x, spot.h, spot.y);
  // (turned to the track's direction: +x is the right of the way of the race; the pits are on pit.side)
  group.rotation.y = -at.dir;
  const lambert = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
  const reach = PIT.offset + DECK.back + DECK.tip;
  const mid = (PIT.offset + DECK.back - DECK.tip) / 2;
  const white = lambert(0xf0efe9);
  const red = lambert(0xc8202c);
  const steel = lambert(0x5d6270);
  const floor = lambert(0xcfccc4);
  // (the face at its tip, toward the far side of the track: +x when the pits are on the left)
  const tipFace = pit.side < 0 ? 0 : 1;
  const faces = [red, red, floor, steel, red, red];
  faces[1 - tipFace] = white;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(reach, DECK.thick, DECK.along), faces);
  slab.position.set(mid * pit.side, raise - DECK.thick / 2, 0);
  // a white stripe round the fascia
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(reach + 0.4, 1.2, DECK.along + 0.4), white);
  stripe.position.set(mid * pit.side, raise - DECK.thick + 1.2, 0);
  // the beams under it, across the track, and the tower it hangs from, behind the garages
  const beams = [-0.4, 0, 0.4].map((k) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(reach, 4, 3), steel);
    b.position.set(mid * pit.side, raise - DECK.thick - 2, k * DECK.along);
    return b;
  });
  const towerX = (PIT.offset + DECK.back - 10) * pit.side;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(20, raise + 18, DECK.along), [white, white, red, white, white, white]);
  tower.position.set(towerX, (raise + 18) / 2, 0);
  // a glass rail round the open edges
  const glass = new THREE.MeshLambertMaterial({ color: 0xbfe4f2, transparent: true, opacity: 0.35, depthWrite: false });
  const railFront = new THREE.Mesh(new THREE.BoxGeometry(1, 6, DECK.along), glass);
  railFront.position.set(-DECK.tip * pit.side, raise + 3, 0);
  const rails = [-1, 1].map((k) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(reach - 20, 6, 1), glass);
    r.position.set((mid - 10) * pit.side, raise + 3, (k * DECK.along) / 2);
    return r;
  });
  // the podium's steps, up on the deck over the middle of the track, facing the camera (as the ceremony does)
  const steps = podiumSteps();
  steps.position.set(0, raise, 0);
  steps.rotation.y = at.dir;
  for (const m of [slab, stripe, ...beams, tower]) m.castShadow = m.receiveShadow = true;
  group.add(slab, stripe, ...beams, tower, railFront, ...rails, steps);
  return group;
}

/** A podium facing +z (turn the group to face the track), `raise` px up (on a podium deck: the crowd below it). */
export function createCeremony(raise = 0): Ceremony {
  const group = new THREE.Group();
  // (everything but the crowd stands up on the deck)
  const stage = new THREE.Group();
  stage.position.y = raise;
  const lambert = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
  // (on a podium deck, the deck's own steps; else its own)
  if (!raise) stage.add(podiumSteps());

  // the drivers: overalls, arms, a helmet; each on its step
  const drivers = [0, 1, 2].map((k) => {
    const body = lambert(0xffffff);
    const trim = lambert(0xffffff);
    const helmet = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const figure = new THREE.Group();
    figure.name = 'driver';
    const legs = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 2.4), body);
    legs.position.y = 2.5;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 2.8), body);
    torso.position.y = 7.4;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(5.1, 1, 2.9), trim);
    belt.position.y = 5.3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), helmet);
    head.position.y = 11.6;
    // arms pivot at the shoulders; the right hand holds a bottle
    const arm = (side: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 3.2, 9.4, 0);
      const limb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.6, 1.4), body);
      limb.position.y = -2.1;
      pivot.add(limb);
      return pivot;
    };
    const left = arm(-1);
    const right = arm(1);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 3, 6), new THREE.MeshLambertMaterial({ color: 0x1f5a2a }));
    bottle.position.set(0, -4.8, 0.6);
    right.add(bottle);
    for (const m of [legs, torso, belt, head]) m.castShadow = true;
    figure.add(legs, torso, belt, head, left, right);
    figure.position.set(PLACE_X[k], STEP[k], 1);
    stage.add(figure);
    return { figure, left, right, body, trim, helmet };
  });

  // champagne: golden drops sprayed from the bottles; confetti: bits of colour falling from above
  const makePoints = (count: number, size: number, colors: number[]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.set(colors[i % colors.length]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true, toneMapped: false }));
    points.frustumCulled = false;
    stage.add(points);
    return { geo, pos: geo.attributes.position as THREE.BufferAttribute, vel: new Float32Array(count * 3), life: new Float32Array(count) };
  };
  const spray = makePoints(DROPS, 1.6, [0xfff1a8, 0xf2d36b, 0xffffff]);
  const confetti = makePoints(CONFETTI, 1.4, [0xd8323c, 0x3d7fc4, 0xf2c14e, 0x5fe0d0, 0xff5fb8, 0xf4f4f8]);
  let next = 0;
  // (seeded, so the ceremony looks the same every time)
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < CONFETTI; i++) {
    confetti.pos.setXYZ(i, (rnd() - 0.5) * 70, 30 + rnd() * 40, (rnd() - 0.5) * 30 + 6);
    confetti.life[i] = 1;
  }

  group.add(stage);

  // the tifosi: a red sea on the track below a hanging podium, jumping, some waving flags
  const crowd = raise
    ? (() => {
        const body = new THREE.InstancedMesh(new THREE.BoxGeometry(2.8, 5, 2), new THREE.MeshLambertMaterial({ color: 0xffffff }), TIFOSI);
        const head = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial({ color: 0xe0b48a }), TIFOSI);
        const flags = Math.ceil(TIFOSI / FLAG_EVERY);
        const flag = new THREE.InstancedMesh(new THREE.BoxGeometry(7, 4.5, 0.4).translate(3.5, 0, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), flags);
        const base = new Float32Array(TIFOSI * 2);
        const phase = new Float32Array(TIFOSI);
        const shirts = [0xd8323c, 0xc8202c, 0xe8414a, 0xd8323c, 0xb81c28, 0xf4f4f8, 0xf2c14e, 0x3d9a5a];
        const banners = [0xd8323c, 0xf2c14e, 0xd8323c, 0x3d9a5a, 0xf4f4f8];
        const c = new THREE.Color();
        for (let i = 0; i < TIFOSI; i++) {
          // (in front of the deck's tip, across the near half of the track and spilling past its far side)
          base[i * 2] = (rnd() - 0.5) * 240;
          base[i * 2 + 1] = DECK.tip + 3 + rnd() * rnd() * (HALF_WIDTH + 50);
          phase[i] = rnd() * Math.PI * 2;
          body.setColorAt(i, c.set(shirts[i % shirts.length]));
          if (i % FLAG_EVERY === 0) flag.setColorAt(i / FLAG_EVERY, c.set(banners[(i / FLAG_EVERY) % banners.length]));
        }
        for (const m of [body, head, flag]) {
          m.frustumCulled = false;
          group.add(m);
        }
        return { body, head, flag, base, phase };
      })()
    : undefined;
  const lift = new THREE.Matrix4();

  const ceremony: Ceremony = {
    group,
    focus: new THREE.Vector3(0, 12 + raise * 0.6, -16),
    setDrivers(list) {
      list.slice(0, 3).forEach((d, k) => {
        drivers[k].body.color.set(d.body);
        drivers[k].trim.color.set(d.trim);
        drivers[k].helmet.color.set(d.helmet);
        drivers[k].figure.visible = true;
      });
      for (let k = list.length; k < 3; k++) drivers[k].figure.visible = false;
    },
    update(t, dt) {
      // the drivers: bouncing, arms up; from 1.2 s the bottles tip toward the middle and spray
      drivers.forEach((d, k) => {
        if (!d.figure.visible) return;
        const hop = Math.max(0, Math.sin(t * 7 + k * 1.3)) * (t < 1.2 ? 2.2 : 0.8);
        d.figure.position.y = STEP[k] + hop;
        const wave = Math.sin(t * 6 + k) * 0.35;
        // (an arm hangs down from its shoulder: turned about z it swings out and up, left arm to the left)
        d.left.rotation.z = -(Math.PI * 0.85 + wave);
        d.right.rotation.z = t < 1.2 ? Math.PI * 0.85 + wave : Math.PI * 0.72;
        // turn toward the middle while spraying (the winner at the others by turns)
        d.figure.rotation.y = t < 1.2 ? 0 : k === 0 ? Math.sin(t * 1.5) * 0.7 : k === 1 ? -0.5 : 0.5;
      });
      // spray: new drops from each bottle's neck, arcing out and up toward the middle
      if (t > 1.2) {
        for (let k = 0; k < 3; k++) {
          const d = drivers[k];
          if (!d.figure.visible) continue;
          const neck = new THREE.Vector3(0, 0, 0);
          d.right.children[1].getWorldPosition(neck);
          stage.worldToLocal(neck);
          for (let j = 0; j < 3; j++) {
            const i = next;
            next = (next + 1) % DROPS;
            spray.pos.setXYZ(i, neck.x, neck.y + 1.5, neck.z);
            const aim = k === 0 ? Math.sin(t * 1.5) : k === 1 ? 1 : -1;
            spray.vel.set([aim * 14 + (rnd() - 0.5) * 8, 22 + rnd() * 10, 6 + (rnd() - 0.5) * 8], i * 3);
            spray.life[i] = 1;
          }
        }
      }
      for (let i = 0; i < DROPS; i++) {
        if (spray.life[i] <= 0) {
          spray.pos.setXYZ(i, 0, -999, 0);
          continue;
        }
        spray.life[i] -= dt * 1.1;
        spray.vel[i * 3 + 1] -= 40 * dt;
        spray.pos.setXYZ(i, spray.pos.getX(i) + spray.vel[i * 3] * dt, spray.pos.getY(i) + spray.vel[i * 3 + 1] * dt, spray.pos.getZ(i) + spray.vel[i * 3 + 2] * dt);
      }
      spray.pos.needsUpdate = true;
      // confetti: drifting down, swaying, back to the top when it lands
      for (let i = 0; i < CONFETTI; i++) {
        let y = confetti.pos.getY(i) - dt * (6 + (i % 5));
        if (y < 0) y += 60;
        confetti.pos.setXYZ(i, confetti.pos.getX(i) + Math.sin(t * 2 + i) * dt * 4, y, confetti.pos.getZ(i));
      }
      confetti.pos.needsUpdate = true;
      if (crowd) {
        for (let i = 0; i < TIFOSI; i++) {
          const x = crowd.base[i * 2];
          const z = crowd.base[i * 2 + 1];
          const hop = Math.max(0, Math.sin(t * 6 + crowd.phase[i])) * 2.5;
          lift.makeTranslation(x, 2.5 + hop, z);
          crowd.body.setMatrixAt(i, lift);
          lift.makeTranslation(x, 6 + hop, z);
          crowd.head.setMatrixAt(i, lift);
          if (i % FLAG_EVERY === 0) {
            // (held up high, flapping)
            lift.makeRotationY(Math.sin(t * 4 + crowd.phase[i]) * 0.6).setPosition(x + 1.5, 11 + hop, z);
            crowd.flag.setMatrixAt(i / FLAG_EVERY, lift);
          }
        }
        for (const m of [crowd.body, crowd.head, crowd.flag]) m.instanceMatrix.needsUpdate = true;
      }
    },
  };
  ceremony.setDrivers([]);
  return ceremony;
}
