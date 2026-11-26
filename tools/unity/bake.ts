// Bakes every circuit into plain JSON for the Unity port (experiment, unity/ folder).
//
// The web game builds a circuit at load time from its layout (buildCircuit: tiles, ground heights, racing line,
// starting grid). Rather than port that builder to C# and keep two copies in step, the port reads what this script
// writes: the real buildCircuit's output, one file per circuit. The runtime rules (driving.ts, sim.ts, racing.ts's
// progress) are ported by hand and checked against golden traces from this same code (golden.ts).
//
//   npm run unity:bake        -> unity/Assets/Resources/Circuits/<id>.json
//   npm run unity:golden      -> unity/Tests~/Core.Tests/golden.json

import { mkdirSync, writeFileSync } from 'node:fs';
import { buildCircuit, type CircuitCell } from '../../src/f1/circuit';
import { LAYOUTS } from '../../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../../src/f1/racing';
import { carClass } from '../../src/engine/driving';
import { handlingFor } from '../../src/f1/difficulty';
import { DIFFICULTIES } from '../../src/f1/difficulty';
import { treesOf } from '../../src/f1/forest3d';
import { standsOf } from '../../src/f1/stands';

/** circuits baked with their scenery (trees, stands) so far: the look pass is one circuit at a time */
const SCENERY = new Set(['crescent-park']);
const KINDS = ['spruce', 'broadleaf', 'palm', 'rock', 'blossom'];

const CELL_CHAR: Record<CircuitCell, string> = { track: 'T', kerb: 'K', grass: 'G', gravel: 'V', apron: 'A', wall: 'W', pit: 'P', pitwall: 'Q' };
const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

export function bakeAll() {
  const f1 = carClass('f1');
  const normal = DIFFICULTIES.find((d) => d.id === 'normal')!;
  const handling = handlingFor(normal);
  const out = 'unity/Assets/Resources/Circuits';
  mkdirSync(out, { recursive: true });
  const index: { id: string; name: string; country?: string; about: string; bridge: boolean }[] = [];
  for (const layout of LAYOUTS) {
    const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1, handling), decel: lineDecel(f1) });
    const t = c.track;
    const baked = {
      id: layout.id,
      name: layout.name,
      country: layout.country ?? '',
      about: layout.about,
      scale: layout.scale,
      tile: c.grid.tile,
      width: c.width,
      height: c.height,
      /** one char per tile, row by row: T track, K kerb, G grass, V gravel, A apron, W wall, P pit, Q pit wall */
      cells: c.cells.map((k) => CELL_CHAR[k]).join(''),
      /** ground height (px) at each tile corner, (width+1)*(height+1), row by row */
      heights: c.grid.heights!.map((h) => round(h)),
      spacing: t.spacing,
      length: t.length,
      samples: { x: t.samples.map((s) => round(s.x)), y: t.samples.map((s) => round(s.y)), s: t.samples.map((s) => round(s.s)), dir: t.samples.map((s) => round(s.dir, 6)), curve: t.samples.map((s) => round(s.curve, 8)), speed: t.samples.map((s) => round(s.speed)) },
      slots: c.slots.map((s) => ({ x: round(s.x), y: round(s.y), heading: round(s.heading, 6) })),
      tyreWear: layout.tyreWear ?? 1,
      /** trees: parallel arrays (map px; height px; kind index into spruce/broadleaf/palm/rock/blossom; crown colour 0xRRGGBB) */
      trees: SCENERY.has(layout.id) ? (() => { const t = treesOf(c); return { x: t.map((q) => round(q.x, 1)), y: t.map((q) => round(q.y, 1)), h: t.map((q) => round(q.h, 1)), kind: t.map((q) => KINDS.indexOf(q.kind)), color: t.map((q) => q.color) }; })() : { x: [], y: [], h: [], kind: [], color: [] },
      stands: SCENERY.has(layout.id) ? standsOf(c).map((q) => ({ x: round(q.x, 1), y: round(q.y, 1), dir: round(q.dir, 5), side: q.side, len: q.len, atStart: q.at === 'start' })) : [],
      // not yet used by the Unity core: a bridge's second level, the pit lane's geometry
      bridge: !!layout.bridge,
    };
    writeFileSync(`${out}/${layout.id}.json`, JSON.stringify(baked));
    index.push({ id: layout.id, name: layout.name, country: layout.country, about: layout.about, bridge: !!layout.bridge });
  }
  writeFileSync(`${out}/index.json`, JSON.stringify(index, null, 1));
  // (JsonUtility can't read a root array: the order the game lists circuits in, as an object)
  writeFileSync(`${out}/order.json`, JSON.stringify({ ids: index.map((c) => c.id) }));
  console.log(`baked ${index.length} circuits`);
}

if (process.argv[1]?.endsWith('bake.mjs')) bakeAll();
