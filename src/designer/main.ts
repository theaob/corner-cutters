// The track designer: a tool of its own, not part of the game (designer.html,
// `npm run designer`). It shows a circuit as the game builds it (the track,
// run-off, pit lane, grandstands, scenery) in 3D, seen through a free,
// first-person camera, and edits the layout: drag its control points over the
// ground, add and remove them, set the height of the ground at each, the pit
// lane and the rest; the circuit is rebuilt as you go and checked against what
// the game needs (see layoutEdit.ts). Export it as code for layouts.ts, or save
// and load it as JSON; a draft is kept in the browser between visits.
//
// Camera: hold the right mouse button to look about; W A S D to move, Q and E
// down and up, Shift to go faster; F switches between flying and walking (at a
// driver's eye height over the ground).

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import type { Circuit } from '../f1/circuit';
import { createCircuitScene, type CircuitScene } from '../f1/circuitScene';
import { LAYOUTS } from '../f1/layouts';
import { DRY } from '../f1/weather';
import { DESIGNER_DRAFT_ID, DESIGNER_DRIVE_KEY } from '../f1/designerDraft';
import { aiLap, blankDraft, check, circuitOf, draftFrom, layoutFrom, layoutToTs, type Draft, type DraftPoint } from './layoutEdit';

const DRAFT_KEY = 'cc:designer:draft';
/** px/s the camera flies at (Shift: four times), and the eye's height over the ground when walking */
const FLY_SPEED = 320;
const EYE = 9;
/** px on screen within which a click picks a control point */
const PICK = 16;

const view = document.getElementById('view')!;
const panel = document.getElementById('panel')!;
const hud = document.getElementById('hud')!;
const crosshair = document.getElementById('crosshair')!;
document.getElementById('help')!.textContent = [
  'right mouse held: look   W A S D: move   Q / E: down / up   Shift: faster',
  'F: fly / walk   left click: pick a point (drag to move it)',
  'N: new point after the picked one   Delete: remove it   [ ]: lower / raise (Shift: ×5)',
  'Home: make it the start line   G: go to it   Ctrl+Z / Ctrl+Y: undo / redo',
].join('\n');

// ---- the renderer and the camera ------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(70, 1, 1, 30000);
camera.rotation.order = 'YXZ';
let yaw = 0;
let pitch = -0.35;
let mode: 'fly' | 'walk' = 'fly';
const resize = () => {
  const r = view.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
};
window.addEventListener('resize', resize);
resize();

// ---- the draft, its history, and the circuit it makes ----------------------------------------------
let draft: Draft = loadSaved() ?? draftFrom(LAYOUTS[0]);
const undo: string[] = [];
const redo: string[] = [];
let selected: number | undefined;
let circuit: Circuit | undefined;
let world: CircuitScene | undefined;
const markers = new THREE.Group();
let line: THREE.LineLoop | undefined;

function loadSaved(): Draft | undefined {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : undefined;
  } catch {
    return undefined;
  }
}

/** Keep a change: onto the undo history, into the browser, and the circuit rebuilt. */
function commit(before: string) {
  undo.push(before);
  if (undo.length > 200) undo.shift();
  redo.length = 0;
  save();
  rebuild();
}

function save() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // (a private window: the draft just isn't kept)
  }
}

/** Where a control point is in the world (the map, as the circuit lays it out), and its ground height. */
function toWorld(p: { x: number; y: number }): THREE.Vector3 {
  const off = circuit?.offset ?? { x: 0, y: 0 };
  const x = p.x * draft.scale - off.x;
  const z = p.y * draft.scale - off.y;
  const h = circuit ? groundAt(circuit.grid, x, z).h : 0;
  return new THREE.Vector3(x, h, z);
}
const fromWorld = (x: number, z: number) => {
  const off = circuit?.offset ?? { x: 0, y: 0 };
  return { x: Math.round((x + off.x) / draft.scale), y: Math.round((z + off.y) / draft.scale) };
};

/** Free a scene's meshes, materials and textures. */
function dispose(scene: THREE.Object3D) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

/** Build the circuit the draft makes, and its scene; the camera kept where it was over the same ground. */
function rebuild() {
  const before = circuit?.offset;
  let next: Circuit;
  try {
    next = circuitOf(layoutFrom(draft));
  } catch (err) {
    status(`can't build it: ${(err as Error).message}`, true);
    renderPanel();
    return;
  }
  if (world) {
    world.scene.remove(markers);
    dispose(world.scene);
  }
  circuit = next;
  world = createCircuitScene(circuit, DRY);
  world.scene.add(markers);
  // (the map is laid out round the track: if it moved, move with it)
  if (before) camera.position.add(new THREE.Vector3(before.x - circuit.offset.x, 0, before.y - circuit.offset.y));
  buildMarkers();
  renderPanel();
  status('');
}

/** The control points as markers over the ground, and a line joining them round the lap. */
function buildMarkers() {
  for (const c of [...markers.children]) {
    markers.remove(c);
    dispose(c);
  }
  const ball = new THREE.SphereGeometry(5, 12, 8);
  draft.points.forEach((p, i) => {
    const color = i === selected ? 0xf2c14e : i === 0 ? 0xffffff : 0xff4fd8;
    const m = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }));
    m.renderOrder = 10;
    m.position.copy(toWorld(p)).add(new THREE.Vector3(0, 10, 0));
    m.scale.setScalar(i === selected ? 1.6 : i === 0 ? 1.3 : 1);
    m.userData.index = i;
    markers.add(m);
  });
  const geo = new THREE.BufferGeometry().setFromPoints(draft.points.map((p) => toWorld(p).add(new THREE.Vector3(0, 10, 0))));
  line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0xff4fd8, depthTest: false, transparent: true, opacity: 0.6 }));
  line.renderOrder = 9;
  markers.add(line);
}

/** While a point is dragged: its marker and the line follow it, the circuit rebuilt when it's let go. */
function moveMarker(i: number) {
  const m = markers.children.find((c) => c.userData.index === i);
  m?.position.copy(toWorld(draft.points[i])).add(new THREE.Vector3(0, 10, 0));
  if (line) line.geometry.setFromPoints(draft.points.map((p) => toWorld(p).add(new THREE.Vector3(0, 10, 0))));
}

// ---- picking ----------------------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
function setMouse(e: MouseEvent) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
}
/** The control point under the mouse, if any (nearest on screen, within PICK px). */
function pickPoint(e: MouseEvent): number | undefined {
  const r = renderer.domElement.getBoundingClientRect();
  let best: number | undefined;
  let bestD = PICK;
  for (const m of markers.children) {
    if (m.userData.index === undefined) continue;
    const v = m.position.clone().project(camera);
    if (v.z > 1) continue;
    const sx = ((v.x + 1) / 2) * r.width + r.left;
    const sy = ((1 - v.y) / 2) * r.height + r.top;
    const d = Math.hypot(sx - e.clientX, sy - e.clientY);
    if (d < bestD) [best, bestD] = [m.userData.index as number, d];
  }
  return best;
}
/** Where the mouse's ray meets the ground (the heights as the circuit has them), if it does. */
function groundHit(): THREE.Vector3 | undefined {
  const { origin, direction } = ray.ray;
  if (direction.y > -1e-3) return undefined;
  let h = 0;
  let p = new THREE.Vector3();
  for (let k = 0; k < 8; k++) {
    const t = (h - origin.y) / direction.y;
    if (t < 0) return undefined;
    p = origin.clone().addScaledVector(direction, t);
    h = circuit ? groundAt(circuit.grid, p.x, p.z).h : 0;
  }
  return p;
}

// ---- the mouse and keys ----------------------------------------------------------------------------
let looking = false;
let dragging: { index: number; before: string } | undefined;
const held = new Set<string>();
const canvas = renderer.domElement;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    looking = true;
    canvas.requestPointerLock?.();
    crosshair.style.display = 'block';
    return;
  }
  if (e.button !== 0) return;
  setMouse(e);
  const i = pickPoint(e);
  selected = i;
  if (i !== undefined) dragging = { index: i, before: JSON.stringify(draft) };
  buildMarkers();
  renderPanel();
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2 && looking) {
    looking = false;
    if (document.pointerLockElement) document.exitPointerLock();
    crosshair.style.display = 'none';
  }
  if (e.button === 0 && dragging) {
    const moved = JSON.stringify(draft) !== dragging.before;
    const before = dragging.before;
    dragging = undefined;
    if (moved) commit(before);
  }
});
window.addEventListener('mousemove', (e) => {
  if (looking) {
    yaw -= e.movementX * 0.0025;
    pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0025));
    return;
  }
  if (!dragging) return;
  setMouse(e);
  const hit = groundHit();
  if (!hit) return;
  const p = fromWorld(hit.x, hit.z);
  const pt = draft.points[dragging.index];
  if (pt.x === p.x && pt.y === p.y) return;
  pt.x = p.x;
  pt.y = p.y;
  moveMarker(dragging.index);
});
const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement || document.activeElement instanceof HTMLTextAreaElement;
window.addEventListener('keydown', (e) => {
  if (typing()) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') return void (e.preventDefault(), step(undo, redo));
  if ((e.ctrlKey || e.metaKey) && k === 'y') return void (e.preventDefault(), step(redo, undo));
  held.add(k);
  if (k === 'f') {
    mode = mode === 'fly' ? 'walk' : 'fly';
    status(mode === 'walk' ? 'walking: at eye height over the ground' : 'flying');
  }
  if (k === 'g' && selected !== undefined) goTo(selected);
  if (selected === undefined) return;
  const before = JSON.stringify(draft);
  const pts = draft.points;
  if (k === 'n') {
    // a new point half way to the next one
    const a = pts[selected];
    const b = pts[(selected + 1) % pts.length];
    pts.splice(selected + 1, 0, { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), h: Math.round(((a.h + b.h) / 2) * 10) / 10 });
    selected++;
    commit(before);
  } else if ((k === 'delete' || k === 'backspace') && pts.length > 4) {
    pts.splice(selected, 1);
    selected = Math.min(selected, pts.length - 1);
    commit(before);
  } else if (k === '[' || k === ']') {
    pts[selected].h = Math.round((pts[selected].h + (k === ']' ? 1 : -1) * (e.shiftKey ? 10 : 2)) * 10) / 10;
    commit(before);
  } else if (k === 'home' && selected > 0) {
    // this point becomes the start line (the lap starts here; the pit lane is placed from it)
    draft.points = [...pts.slice(selected), ...pts.slice(0, selected)];
    selected = 0;
    commit(before);
  }
});
window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => held.clear());

function step(from: string[], to: string[]) {
  const prev = from.pop();
  if (!prev) return;
  to.push(JSON.stringify(draft));
  draft = JSON.parse(prev);
  if (selected !== undefined && selected >= draft.points.length) selected = undefined;
  save();
  rebuild();
}

/** Put the camera a little behind and above point `i`, looking along the lap. */
function goTo(i: number) {
  const p = toWorld(draft.points[i]);
  const q = toWorld(draft.points[(i + 1) % draft.points.length]);
  const dir = Math.atan2(q.x - p.x, q.z - p.z);
  yaw = dir + Math.PI;
  // (looking down at the point)
  pitch = -Math.atan2(70, 160);
  camera.position.set(p.x - Math.sin(dir) * 160, p.y + 70, p.z - Math.cos(dir) * 160);
}

// ---- the panel ----------------------------------------------------------------------------------------
let statusText = '';
let statusBad = false;
function status(text: string, bad = false) {
  statusText = text;
  statusBad = bad;
  const el = document.getElementById('status');
  if (el) {
    el.textContent = text;
    el.style.color = bad ? 'var(--bad)' : '';
  }
}

function field(label: string, value: string | number, onChange: (v: string) => void, type = 'text', step?: string): HTMLLabelElement {
  const l = document.createElement('label');
  l.append(label);
  const input = document.createElement('input');
  input.type = type;
  input.value = String(value);
  if (step) input.step = step;
  input.addEventListener('change', () => onChange(input.value));
  l.append(input);
  return l;
}
function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
function heading(text: string) {
  const h = document.createElement('h2');
  h.textContent = text;
  return h;
}
/** Change the draft from the panel: kept, and the circuit rebuilt. */
function edit(change: () => void) {
  const before = JSON.stringify(draft);
  change();
  if (JSON.stringify(draft) !== before) commit(before);
}

function renderPanel() {
  panel.innerHTML = '';
  const title = document.createElement('h1');
  title.textContent = 'Track Designer';
  const sub = document.createElement('div');
  sub.style.color = 'var(--muted)';
  sub.textContent = 'Corner Cutters · shape a circuit, then export it for layouts.ts';
  panel.append(title, sub);

  // load: a circuit of the game's, or a blank
  panel.append(heading('Start from'));
  const pick = document.createElement('select');
  for (const l of LAYOUTS) pick.append(new Option(l.name, l.id));
  pick.append(new Option('A blank (a rounded rectangle)', '__blank'));
  const loadRow = document.createElement('div');
  loadRow.className = 'row';
  loadRow.append(pick, button('Load', () => {
    const before = JSON.stringify(draft);
    draft = pick.value === '__blank' ? blankDraft() : draftFrom(LAYOUTS.find((l) => l.id === pick.value)!);
    selected = undefined;
    commit(before);
    goTo(0);
  }));
  panel.append(loadRow);

  panel.append(heading('Circuit'));
  panel.append(
    field('id', draft.id, (v) => edit(() => (draft.id = v.trim() || draft.id))),
    field('name', draft.name, (v) => edit(() => (draft.name = v))),
    field('about', draft.about, (v) => edit(() => (draft.about = v))),
    field('scale', draft.scale, (v) => edit(() => (draft.scale = Math.max(0.2, Number(v) || draft.scale))), 'number', '0.05'),
    field('tyre wear', draft.extras.tyreWear ?? '', (v) => edit(() => (draft.extras.tyreWear = v === '' ? undefined : Number(v)))),
  );
  const forest = document.createElement('label');
  forest.append('forest');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = !!draft.extras.forest;
  box.addEventListener('change', () => edit(() => (draft.extras.forest = box.checked || undefined)));
  forest.append(box);
  panel.append(forest);

  panel.append(heading('Pit lane (px from the line)'));
  panel.append(
    field('from', draft.pit.from, (v) => edit(() => (draft.pit.from = Number(v)))),
    field('to', draft.pit.to, (v) => edit(() => (draft.pit.to = Number(v)))),
  );
  const side = document.createElement('label');
  side.append('side');
  const sideSel = document.createElement('select');
  sideSel.append(new Option('left of the way of the race', '-1'), new Option('right', '1'));
  sideSel.value = String(draft.pit.side);
  sideSel.addEventListener('change', () => edit(() => (draft.pit.side = Number(sideSel.value) as -1 | 1)));
  side.append(sideSel);
  panel.append(side);

  panel.append(heading(selected === undefined ? 'Point (pick one)' : `Point ${selected}${selected === 0 ? ' · the start line' : ''}`));
  if (selected !== undefined) {
    const p: DraftPoint = draft.points[selected];
    const i = selected;
    panel.append(
      field('x', p.x, (v) => edit(() => (draft.points[i].x = Number(v))), 'number'),
      field('y', p.y, (v) => edit(() => (draft.points[i].y = Number(v))), 'number'),
      field('height (px)', p.h, (v) => edit(() => (draft.points[i].h = Number(v))), 'number', '1'),
    );
  }
  const count = document.createElement('div');
  count.style.color = 'var(--muted)';
  count.textContent = `${draft.points.length} points`;
  panel.append(count);

  panel.append(heading('Checks'));
  const checks = document.createElement('div');
  checks.id = 'checks';
  if (circuit) {
    for (const c of check(layoutFrom(draft), circuit)) {
      const row = document.createElement('div');
      row.className = c.ok ? 'ok' : 'bad';
      const mark = document.createElement('b');
      mark.textContent = c.ok ? '✓' : '✗';
      const text = document.createElement('span');
      text.textContent = `${c.label}: ${c.value}`;
      row.append(mark, text);
      checks.append(row);
    }
  }
  panel.append(checks);
  const lapRow = document.createElement('div');
  lapRow.className = 'row';
  const lapOut = document.createElement('span');
  lapRow.append(button('AI lap', () => {
    if (!circuit) return;
    const lap = aiLap(circuit);
    lapOut.textContent = lap.time === undefined ? 'no lap in 2 minutes' : `${lap.time.toFixed(2)} s${lap.damage ? ` · ${Math.round(lap.damage)} damage` : ' · unhurt'}`;
    lapOut.style.color = lap.time === undefined || lap.damage ? 'var(--bad)' : 'var(--good)';
  }), lapOut);
  panel.append(lapRow);

  // drive it: the draft in the game itself, in a tab of its own (its quit comes back here)
  panel.append(heading('Drive it'));
  const driveRow = document.createElement('div');
  driveRow.className = 'row';
  const driveMode = document.createElement('select');
  driveMode.style.width = 'auto';
  driveMode.append(new Option('Quick race', 'race'), new Option('Time trial (alone)', 'timetrial'));
  try {
    driveMode.value = localStorage.getItem(`${DESIGNER_DRIVE_KEY}:mode`) ?? 'timetrial';
  } catch {
    driveMode.value = 'timetrial';
  }
  const drive = button('Drive it ▶', () => drive_(driveMode.value));
  drive.style.borderColor = 'var(--gold)';
  drive.style.color = 'var(--gold)';
  driveRow.append(driveMode, drive);
  panel.append(driveRow);

  panel.append(heading('Export'));
  const out = document.createElement('div');
  out.className = 'row';
  out.append(
    button('Copy as code', async () => {
      const ts = layoutToTs(layoutFrom(draft));
      try {
        await navigator.clipboard.writeText(ts);
        status('copied: paste it into src/f1/layouts.ts and add it to LAYOUTS');
      } catch {
        download(`${draft.id}.ts`, ts, 'text/plain');
        status('saved as a file (the clipboard was refused)');
      }
    }),
    button('Save JSON', () => download(`${draft.id}.json`, JSON.stringify(layoutFrom(draft), null, 2), 'application/json')),
    button('Open JSON', () => openJson()),
  );
  panel.append(out);
  const st = document.createElement('div');
  st.id = 'status';
  panel.append(st);
  status(statusText, statusBad);
}

/** Open the game on the draft as it is now (`mode`: a quick race or a time trial). */
function drive_(mode: string) {
  if (!circuit) return status("can't drive it: it doesn't build", true);
  try {
    localStorage.setItem(DESIGNER_DRIVE_KEY, JSON.stringify(layoutFrom(draft)));
    localStorage.setItem(`${DESIGNER_DRIVE_KEY}:mode`, mode);
  } catch {
    return status("can't drive it: the browser won't keep it (a private window?)", true);
  }
  const failing = check(layoutFrom(draft), circuit).filter((c) => !c.ok).map((c) => c.label);
  window.open(`./index.html?circuit=${DESIGNER_DRAFT_ID}&mode=${mode}`, 'corner-cutters-drive');
  status(failing.length ? `driving it as it is (failing: ${failing.join(', ')})` : 'driving it in the game (a tab of its own)', failing.length > 0);
}

function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function openJson() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const layout = JSON.parse(await file.text());
      if (!Array.isArray(layout.points) || !Array.isArray(layout.elevation) || !layout.pit) throw new Error('not a circuit layout');
      const before = JSON.stringify(draft);
      draft = draftFrom(layout);
      selected = undefined;
      commit(before);
      goTo(0);
    } catch (err) {
      status(`couldn't open it: ${(err as Error).message}`, true);
    }
  });
  input.click();
}

// ---- the loop ----------------------------------------------------------------------------------------
const clock = new THREE.Clock();
const focus = new THREE.Vector3();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  // move: along where it looks (walking: along the ground)
  const speed = FLY_SPEED * (held.has('shift') ? 4 : 1) * dt;
  const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(mode === 'fly' ? pitch : 0), mode === 'fly' ? Math.sin(pitch) : 0, -Math.cos(yaw) * Math.cos(mode === 'fly' ? pitch : 0));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  if (!typing()) {
    if (held.has('w')) camera.position.addScaledVector(fwd, speed);
    if (held.has('s')) camera.position.addScaledVector(fwd, -speed);
    if (held.has('d')) camera.position.addScaledVector(right, speed);
    if (held.has('a')) camera.position.addScaledVector(right, -speed);
    if (mode === 'fly' && held.has('e')) camera.position.y += speed;
    if (mode === 'fly' && held.has('q')) camera.position.y -= speed;
  }
  const ground = circuit ? groundAt(circuit.grid, camera.position.x, camera.position.z).h : 0;
  if (mode === 'walk') camera.position.y = ground + EYE;
  else camera.position.y = Math.max(ground + 2, camera.position.y);
  camera.rotation.set(pitch, yaw, 0);
  // (the markers the same size on screen however near or far: a dot, not a ball in the way)
  for (const m of markers.children) {
    if (m.userData.index === undefined) continue;
    const base = m.userData.index === selected ? 1.6 : m.userData.index === 0 ? 1.3 : 1;
    m.scale.setScalar(base * Math.max(0.15, camera.position.distanceTo(m.position) * 0.003));
  }
  if (world) {
    // the sun's shadows round what the camera looks at
    focus.copy(camera.position).addScaledVector(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), 200);
    focus.y = circuit ? groundAt(circuit.grid, focus.x, focus.z).h : 0;
    world.followSun(focus);
    world.animate(performance.now() / 1000);
    renderer.render(world.scene, camera);
  }
  hud.textContent = `${mode === 'walk' ? 'WALK' : 'FLY'} · x ${Math.round(camera.position.x)} y ${Math.round(camera.position.z)} · ${Math.round(camera.position.y - ground)} px up${selected !== undefined ? ` · point ${selected}` : ''}`;
  requestAnimationFrame(frame);
}

rebuild();
goTo(0);
requestAnimationFrame(frame);

// (for checking the designer in a browser from a script: where each point's marker is on screen, and the draft)
(window as unknown as { __designer: unknown }).__designer = {
  draft: () => draft,
  selected: () => selected,
  onScreen: (i: number) => {
    const m = markers.children.find((c) => c.userData.index === i);
    if (!m) return undefined;
    const v = m.position.clone().project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width + r.left, y: ((1 - v.y) / 2) * r.height + r.top, behind: v.z > 1 };
  },
  goTo,
};
