import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCameraRig, type CameraFrame, type Shot } from '../src/f1/race/camera';
import { HD2D_VIEW } from '../src/engine/look';

// the capture build's showreel directs the race's camera with shots (race/camera.ts); with none it's the game's own view
describe('camera shots', () => {
  const car = { x: 100, y: 200, vx: 0, vy: 0, heading: 0, cls: { topSpeed: 300 } };
  const frame = (shot?: Shot): CameraFrame => ({
    dt: 1 / 60, you: 0, session: 'race', drawn: { x: car.x, y: car.y, z: 0 }, replay: undefined, gridPan: undefined, podium: undefined, lookAt: undefined,
    lead: 0, zoom: 1, viewH: 400, shake: { trauma: 0, t: 0 } as unknown as CameraFrame['shake'], shot,
    race: { phase: 'lights', entrants: [{ car, progress: { retired: true }, tow: 0 }] } as unknown as CameraFrame['race'],
    grid: undefined as unknown as CameraFrame['grid'], recorder: undefined as unknown as CameraFrame['recorder'],
  });
  const rig = () => {
    const camera = new THREE.PerspectiveCamera(HD2D_VIEW.fov, 16 / 9, 1, 4000);
    camera.up.set(0, 0, -1);
    return { camera, rig: createCameraRig(camera, undefined as unknown as Parameters<typeof createCameraRig>[1], car) };
  };
  /** the camera's distance from what it looks at, how far round it is (deg) and how far up (deg) */
  const seen = (camera: THREE.PerspectiveCamera, focus: THREE.Vector3) => {
    const d = camera.position.clone().sub(focus);
    return { dist: d.length(), yaw: THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z)), pitch: THREE.MathUtils.radToDeg(Math.asin(d.y / d.length())) };
  };

  it("is the game's own view with no shot: square on, at the view's pitch", () => {
    const { camera, rig: r } = rig();
    r.step(frame());
    const v = seen(camera, r.focus);
    expect(v.yaw).toBeCloseTo(0);
    expect(v.pitch).toBeCloseTo(HD2D_VIEW.pitch);
  });
  it('cuts to a shot at once: closer, round the car and lower', () => {
    const { camera, rig: r } = rig();
    r.step(frame());
    const before = seen(camera, r.focus);
    r.step(frame({ zoom: 2, yaw: 30, pitch: -10, cut: true }));
    const v = seen(camera, r.focus);
    expect(v.dist).toBeCloseTo(before.dist / 2);
    expect(v.yaw).toBeCloseTo(30);
    expect(v.pitch).toBeCloseTo(HD2D_VIEW.pitch - 10);
  });
  it('eases into a shot that is not a cut, and back out of it', () => {
    const { camera, rig: r } = rig();
    const shot: Shot = { zoom: 2, yaw: 30, pitch: 0 };
    r.step(frame());
    const far = seen(camera, r.focus).dist;
    r.step(frame(shot));
    const first = seen(camera, r.focus);
    expect(first.dist).toBeLessThan(far);
    expect(first.dist).toBeGreaterThan(far / 2 + 1);
    for (let i = 0; i < 600; i++) r.step(frame(shot));
    expect(seen(camera, r.focus).yaw).toBeCloseTo(30, 1);
    for (let i = 0; i < 600; i++) r.step(frame());
    expect(seen(camera, r.focus).yaw).toBeCloseTo(0, 1);
    expect(seen(camera, r.focus).dist).toBeCloseTo(far, 0);
  });
  it('chases the car: behind it whichever way it heads, coming round as it turns', () => {
    const { camera, rig: r } = rig();
    const shot: Shot = { zoom: 1, yaw: 0, pitch: 0, follow: true, cut: true };
    // (heading east: the camera to the west of it)
    Object.assign(car, { heading: Math.PI / 2 });
    r.step(frame(shot));
    expect(seen(camera, r.focus).yaw).toBeCloseTo(-90);
    // (it turns to head south: the camera comes round to the north, the short way)
    Object.assign(car, { heading: Math.PI });
    r.step(frame(shot));
    const part = seen(camera, r.focus).yaw;
    expect(part).toBeLessThan(-90);
    expect(part).toBeGreaterThan(-180);
    for (let i = 0; i < 600; i++) r.step(frame(shot));
    expect(Math.abs(seen(camera, r.focus).yaw)).toBeCloseTo(180, 0);
    Object.assign(car, { heading: 0 });
  });
  it('keeps turning round the car in an orbit', () => {
    const { camera, rig: r } = rig();
    const shot: Shot = { zoom: 1, yaw: 0, pitch: 0, spin: 10, cut: true };
    for (let i = 0; i < 120; i++) r.step(frame(shot));
    const a = seen(camera, r.focus).yaw;
    for (let i = 0; i < 120; i++) r.step(frame(shot));
    expect(seen(camera, r.focus).yaw - a).toBeCloseTo(20, 0);
  });
});
