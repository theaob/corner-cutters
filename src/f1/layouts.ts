// The circuits. Each is a centreline (control points in racing order, the
// first on the start/finish line), a scale, and an elevation profile along the
// lap; circuit.ts turns one into tiles, run-off, heights and a starting grid.

import type { Pt } from './racing';

export interface CircuitLayout {
  id: string;
  name: string;
  /** the real circuit it's modelled on */
  inspiredBy: string;
  /** centreline control points (px, before scaling), in racing order; the first is on the start/finish line */
  points: Pt[];
  /** px per unit of `points` */
  scale: number;
  /** elevation (px) along the lap, as [share of the lap, height]; the first and last heights match */
  elevation: [number, number][];
}

/**
 * Amimo Park, inspired by Istanbul Park. Anticlockwise, like the real one: a
 * downhill Turn 1 left and Turn 2 right, a fast sweeping Turn 3, a twisty
 * middle section, the long four-apex Turn 8 left, the Turn 9–10 esses, a long
 * back straight with a kink, a heavy-braking Turn 12, and the Turn 13–14
 * chicane onto the main straight. A lap is about 7600 px, about 24 s.
 */
export const AMIMO_PARK: CircuitLayout = {
  id: 'amimo-park',
  name: 'Amimo Park',
  inspiredBy: 'Istanbul Park',
  points: [
    // main straight, running north up the east side
    { x: 2300, y: 1000 },
    { x: 2300, y: 700 },
    // T1: downhill left
    { x: 2270, y: 470 },
    { x: 2170, y: 390 },
    // T2: right
    { x: 2040, y: 380 },
    { x: 1960, y: 300 },
    // T3: long fast left
    { x: 1850, y: 210 },
    { x: 1680, y: 210 },
    { x: 1560, y: 290 },
    // T4–T7: the twisty middle
    { x: 1440, y: 420 },
    { x: 1330, y: 560 },
    { x: 1180, y: 600 },
    { x: 1030, y: 540 },
    { x: 890, y: 590 },
    { x: 720, y: 700 },
    // T8: the long four-apex left, round the west end
    { x: 540, y: 720 },
    { x: 380, y: 800 },
    { x: 290, y: 980 },
    { x: 330, y: 1160 },
    { x: 460, y: 1280 },
    { x: 640, y: 1300 },
    // T9–T10: right, left
    { x: 790, y: 1360 },
    { x: 900, y: 1450 },
    // back straight with the T11 kink
    { x: 1100, y: 1480 },
    { x: 1500, y: 1460 },
    { x: 1900, y: 1490 },
    // T12: heavy braking, left
    { x: 2140, y: 1500 },
    { x: 2210, y: 1420 },
    // T13–T14 chicane
    { x: 2220, y: 1320 },
    { x: 2290, y: 1260 },
    { x: 2300, y: 1150 },
  ],
  scale: 1.35,
  // the dip through T1, climbs round T3 and T8
  elevation: [
    [0, 22],
    [0.06, 24],
    [0.1, 4],
    [0.16, 2],
    [0.24, 18],
    [0.36, 14],
    [0.46, 6],
    [0.58, 20],
    [0.7, 12],
    [0.84, 10],
    [0.94, 18],
    [1, 22],
  ],
};

/**
 * Silver Heath, inspired by Silverstone. Clockwise and fast, traced from the
 * real circuit's outline (in metres, eased a little so the bends suit the
 * arcade handling; from github.com/bacinger/f1-circuits, MIT): from the start
 * on the Hamilton Straight, Abbey and Farm, the tight Village–Loop–Aintree
 * hook, the Wellington Straight, Brooklands and the long Luffield right,
 * Woodcote, flat-out Copse, the Maggotts–Becketts–Chapel esses, the Hangar
 * Straight, Stowe, and the Vale–Club complex back onto the straight. The Loop
 * and Vale are the two places to lift. A lap is about 8800 px, about 27 s.
 */
export const SILVER_HEATH: CircuitLayout = {
  id: 'silver-heath',
  name: 'Silver Heath',
  inspiredBy: 'Silverstone',
  points: ([
    [159, 1017], [195, 970], [232, 923], [272, 880], [319, 851], [374, 841],
    [433, 843], [491, 841], [546, 825], [597, 796], [645, 761], [692, 733],
    [734, 732], [767, 762], [796, 791], [826, 784], [848, 742], [854, 687],
    [838, 636], [802, 591], [759, 550], [715, 510], [671, 469], [626, 429],
    [582, 389], [537, 348], [493, 308], [448, 268], [402, 232], [353, 210],
    [308, 217], [276, 253], [251, 297], [218, 319], [186, 303], [180, 259],
    [197, 206], [226, 154], [261, 107], [305, 69], [357, 43], [414, 29],
    [474, 21], [533, 15], [593, 10], [653, 5], [713, 0], [771, 0],
    [825, 14], [867, 48], [894, 97], [911, 154], [925, 212], [934, 272],
    [939, 331], [943, 391], [947, 451], [957, 509], [972, 565], [979, 621],
    [972, 678], [966, 735], [974, 790], [990, 843], [988, 894], [960, 938],
    [917, 977], [877, 1019], [844, 1068], [815, 1121], [786, 1173], [757, 1226],
    [729, 1279], [700, 1331], [671, 1384], [642, 1436], [613, 1489], [582, 1541],
    [550, 1591], [515, 1638], [472, 1672], [422, 1681], [375, 1660], [339, 1617],
    [307, 1568], [272, 1520], [233, 1474], [193, 1431], [151, 1396], [106, 1382],
    [60, 1374], [22, 1344], [0, 1296], [2, 1243], [27, 1192], [61, 1144],
    [97, 1096], [134, 1049],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 1.6,
  // an old airfield, nearly flat: a gentle crest at Copse, rising along the Hangar Straight to Stowe, down through Vale
  elevation: [
    [0, 10],
    [0.1, 12],
    [0.2, 6],
    [0.32, 4],
    [0.45, 10],
    [0.6, 22],
    [0.66, 18],
    [0.82, 26],
    [0.9, 14],
    [1, 10],
  ],
};

export const LAYOUTS: CircuitLayout[] = [AMIMO_PARK, SILVER_HEATH];

/** The layout with this id, or undefined. */
export function layoutById(id: string | null | undefined): CircuitLayout | undefined {
  return LAYOUTS.find((l) => l.id === id);
}
