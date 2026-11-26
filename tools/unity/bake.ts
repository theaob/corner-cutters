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
import { spectatorsOf } from '../../src/f1/crowd3d';
import { barrierTiles, garageSpots, roofOrder } from '../../src/f1/circuitScene';
import { PIT, between } from '../../src/f1/pits';
import { LANE_IN, PIT_WALL } from '../../src/f1/circuit';

/** circuits baked with their scenery (trees, stands) so far: the look pass is one circuit at a time */
const SCENERY = new Set(['crescent-park']);
const KINDS = ['spruce', 'broadleaf', 'palm', 'rock', 'blossom'];

const CELL_CHAR: Record<CircuitCell, string> = { track: 'T', kerb: 'K', grass: 'G', gravel: 'V', apron: 'A', wall: 'W', pit: 'P', pitwall: 'Q' };
const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/** The pit buildings, as circuitScene places them: the garages (their middles and the lane's way) and the pit wall's run. */
function pitsOf(c: ReturnType<typeof buildCircuit>) {
  const pit = c.pit;
  const wallPts = pit.points.filter((p) => between(p.idx, pit.wallFrom, pit.wallTo, c.track.samples.length));
  const wallThick = PIT.offset - LANE_IN - PIT_WALL;
  return {
    side: pit.side,
    boxSpacing: PIT.boxSpacing,
    garages: garageSpots(c).map((g) => ({ x: round(g.x, 2), y: round(g.y, 2), dir: round(g.dir, 6) })),
    /** the pit wall: blocks between consecutive points, wallThick px thick, centred wallAcross px from the lane's line */
    wall: { x: wallPts.map((p) => round(p.x, 2)), y: wallPts.map((p) => round(p.y, 2)), dir: wallPts.map((p) => round(p.dir, 6)) },
    wallThick,
    wallAcross: -(PIT.offset - PIT_WALL - wallThick / 2) * pit.side,
    /** a word across the roofs (Resources/Grounds/<id>-roof.png, from unity:grounds), and the roofs in reading order with the way to read along each */
    roof: c.layout.pitRoof ?? '',
    roofs: c.layout.pitRoof ? roofOrder(c).map((r) => ({ x: round(r.g.x, 2), y: round(r.g.y, 2), tx: round(r.tx, 6), tz: round(r.tz, 6) })) : [],
  };
}

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
      /** every circuit's grandstands (standsOf), each with its crowd as crowd3d places it (stand-local px: x toward its back, z along it; floor px up; phase) */
      stands: standsOf(c).map((q, k) => {
        const people = spectatorsOf(q, k * 7919 + 13);
        return { x: round(q.x, 2), y: round(q.y, 2), dir: round(q.dir, 6), side: q.side, len: q.len, atStart: q.at === 'start', crowd: { x: people.map((p) => round(p.x, 2)), z: people.map((p) => round(p.z, 2)), floor: people.map((p) => round(p.floor, 2)), phase: people.map((p) => round(p.phase, 4)) } };
      }),
      /** the barriers as the web game stands them (tile indices j*width+i): tyre walls, the banking's concrete, the Wall of Champions */
      barriers: (() => { const b = barrierTiles(c); const ix = (l: [number, number][]) => l.map(([i, j]) => j * c.width + i); return { walls: ix(b.walls), bank: ix(b.bankWall), champions: ix(b.champions) }; })(),
      /** what the tyre walls are on this circuit: tyres (stacks), steel (a street circuit's) or bales (on dirt) */
      barrierKind: layout.street ? 'steel' : layout.dirt ? 'bales' : 'tyres',
      pits: pitsOf(c),
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
