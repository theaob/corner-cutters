// The race's camera: it follows your car (looking ahead along its motion), or
// on a point the debug hook holds, your car as it was in a replay, the grid pan,
// or the podium at the ceremony. Speed pulls it back (a touch less for a device
// asking for less motion), and so does a battle with a rival; a shake moves it
// across its own view. What eases from frame to frame is kept here.

import * as THREE from 'three';
import { speedOf, type Car } from '../../engine/driving';
import { HD2D_VIEW } from '../../engine/look';
import { groundAt, type Grid } from '../../engine/sim';
import { motionReduced } from '../access';
import { GRID_PAN, panAt } from '../gridPan';
import { CEREMONY } from '../podium3d';
import { running, type Race } from '../raceControl';
import { replayPose, type ReplayRecorder } from '../replay';
import { ZOOM_OUT, rushOf, shakeOffset, shakeOn, zoomOf, type ShakeState } from '../shake';
import type { createCeremonyView } from './ceremonyView';

const LOOK = HD2D_VIEW;
const deg = THREE.MathUtils.degToRad;
/** How much closer the camera comes for the ceremony. */
export const CEREMONY_ZOOM = 2.6;
/** Wheel to wheel: a rival this close (px) pulls the camera back this much more, eased in and slowly out. */
const BATTLE = { near: 50, pullBack: 0.08 };

/** What the camera needs of the frame it's moved for. */
export interface CameraFrame {
  dt: number;
  race: Race;
  you: number;
  session: string;
  grid: Grid;
  /** your car as drawn this frame (between its last two steps) */
  drawn: { x: number; y: number; z: number };
  recorder: ReplayRecorder;
  replay: { t: number; follow: number } | undefined;
  gridPan: { t: number; slots: Parameters<typeof panAt>[0] } | undefined;
  podium: { time: number } | undefined;
  /** the debug hook's: the camera held on a point of the map */
  lookAt: { x: number; y: number } | undefined;
  /** the circuit's height, tuning's lead (how far ahead the camera looks) and zoom */
  lead: number;
  zoom: number;
  /** the screen's height (px) */
  viewH: number;
  shake: ShakeState;
}

/** The camera's rig: `focus` is what it looks at (eased), `feel` the speed and battle effects now. */
export function createCameraRig(camera: THREE.PerspectiveCamera, ceremony: ReturnType<typeof createCeremonyView>, start: { x: number; y: number }) {
  const focus = new THREE.Vector3(start.x, 0, start.y);
  const target = new THREE.Vector3();
  /** the camera's zoom for the grid pan, eased */
  let panZoom = 1;
  /** the rush now (eased toward what the speed says; it feeds the sound) */
  let rushNow = 0;
  /** how far the camera has pulled back for speed now (eased toward what the speed says) */
  let zoomNow = 0;
  let battleNow = 0;
  return {
    focus,
    rush: () => rushNow,
    battle: () => battleNow,
    /** Moves the camera for this frame. */
    step(f: CameraFrame) {
      const { dt, race, you, session, grid, drawn, recorder, replay, gridPan, podium, lookAt, shake, viewH } = f;
      const c: Car = race.entrants[you].car;
      const mineThen = replay && replayPose(recorder, replay.follow, replay.t);
      if (lookAt) {
        // (the debug hook's: the camera on a point of the map)
        target.set(lookAt.x, groundAt(grid, lookAt.x, lookAt.y).h, lookAt.y);
        focus.copy(target);
      } else if (mineThen) {
        // the replay: on your car as it was, looking ahead along its way
        target.set(mineThen.x + Math.sin(mineThen.heading) * f.lead * 0.6, mineThen.z * 0.5, mineThen.y - Math.cos(mineThen.heading) * f.lead * 0.6);
      } else if (gridPan) {
        // the grid pan: along the grid from pole to the back
        const at = panAt(gridPan.slots, gridPan.t);
        target.set(at.x, groundAt(grid, at.x, at.y).h * 0.5, at.y);
        focus.copy(target);
      } else if (podium) {
        // on the ceremony's set (the results over it: from above, as ever)
        target.copy(ceremony.ceremony.view(CEREMONY.len, camera.aspect, camera.fov).at);
        ceremony.ceremony.group.localToWorld(target);
        if (podium.time <= dt) focus.copy(target);
      } else target.set(drawn.x + (c.vx / c.cls.topSpeed) * f.lead, drawn.z * 0.5, drawn.y + (c.vy / c.cls.topSpeed) * f.lead);
      focus.lerp(target, 1 - Math.exp(-dt * 6));
      const pitch = deg(LOOK.pitch);
      // (the zoom eases back out from the grid pan's)
      panZoom += ((gridPan ? GRID_PAN.zoom : 1) - panZoom) * (1 - Math.exp(-dt * 4));
      // (speed pulls the camera back, smoothly: a touch less for a device asking for less motion)
      const meNow = race.entrants[you];
      const rushWant = !replay && !podium && !gridPan && running(meNow) && !meNow.pit ? rushOf(speedOf(meNow.car), meNow.car.cls.topSpeed, meNow.tow) : 0;
      rushNow += (rushWant - rushNow) * Math.min(1, dt * 3);
      const zoomWant = !replay && !podium && !gridPan && running(meNow) && !meNow.pit ? zoomOf(speedOf(meNow.car), meNow.car.cls.topSpeed) * (motionReduced() ? ZOOM_OUT.calm : 1) : 0;
      zoomNow += (zoomWant - zoomNow) * Math.min(1, dt * 1.5);
      // (wheel to wheel with a rival, it pulls back a touch more, to show you both)
      const battleWant = !replay && !podium && !gridPan && session === 'race' && race.phase === 'racing' && running(meNow) && !meNow.pit
        && race.entrants.some((e, i) => i !== you && running(e) && !e.pit && Math.hypot(e.car.x - meNow.car.x, e.car.y - meNow.car.y) < BATTLE.near) ? 1 : 0;
      battleNow += (battleWant - battleNow) * Math.min(1, dt * (battleWant ? 2 : 0.8));
      const dist = (viewH / (2 * Math.tan(deg(LOOK.fov / 2))) / (f.zoom * (podium ? CEREMONY_ZOOM : panZoom))) * (1 + ZOOM_OUT.pullBack * zoomNow + BATTLE.pullBack * battleNow);
      camera.position.set(focus.x, focus.y + Math.sin(pitch) * dist, focus.z + Math.cos(pitch) * dist);
      camera.lookAt(focus.x, focus.y, focus.z);
      // the shake: the camera moved across and up its own view (SCREEN SHAKE off in the settings: still)
      if (shakeOn()) {
        const o = shakeOffset(shake);
        camera.translateX(o.x);
        camera.translateY(o.y);
      }
    },
  };
}
