// The circuits. Each is a centreline (control points in racing order, the
// first on the start/finish line), a scale, and an elevation profile along the
// lap; circuit.ts turns one into tiles, run-off, heights and a starting grid.

import type { PitSpec } from './pits';
import type { Pt } from './racing';

export interface CircuitLayout {
  id: string;
  name: string;
  /** a line about it, for the menu */
  about: string;
  /** centreline control points (px, before scaling), in racing order; the first is on the start/finish line */
  points: Pt[];
  /** px per unit of `points` */
  scale: number;
  /** elevation (px) along the lap, as [share of the lap, height]; the first and last heights match */
  elevation: [number, number][];
  /** the pit lane, beside the main straight */
  pit: PitSpec;
  /** how hard it is on tyres (1 unless given) */
  tyreWear?: number;
  /** a street circuit: walls `runoff` px off the track's edge (pavement between), the town all round, the sea (a polygon, in `points` units), and a tunnel (px along the lap, from and to) */
  street?: StreetSpec;
}

export interface StreetSpec {
  runoff: number;
  sea: Pt[];
  tunnel: [number, number];
}

/**
 * Crescent Park. Anticlockwise: a downhill Turn 1 left and Turn 2 right, a fast
 * sweeping Turn 3, a twisty middle section, the long four-apex Turn 8 left, the
 * Turn 9–10 esses, a long back straight with a kink, a heavy-braking Turn 12,
 * and the Turn 13–14 chicane onto the main straight. A lap is about 7600 px,
 * about 24 s.
 */
export const CRESCENT_PARK: CircuitLayout = {
  id: 'crescent-park',
  name: 'Crescent Park',
  about: 'anticlockwise · flowing, flat out',
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
  // on the infield, from the chicane's exit to the run up to T1
  pit: { from: -260, to: 560, side: -1 },
};

/**
 * Silver Heath. Clockwise and fast, traced from a circuit outline (in metres,
 * eased a little so the bends suit the arcade handling; outline data from
 * github.com/bacinger/f1-circuits, MIT): from the start straight, a fast right
 * and a left kink, a tight right–hairpin–left hook, a long straight, a left and
 * a long right, a fast right onto the old straight, a flat-out right, a run of
 * esses onto the longest straight, a fast right, and a tight left–right complex
 * back onto the start straight. The hook's hairpin and the last complex are the
 * two places to lift. A lap is about 8800 px, about 27 s.
 */
export const SILVER_HEATH: CircuitLayout = {
  id: 'silver-heath',
  name: 'Silver Heath',
  about: 'clockwise · fast, two hard stops',
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
  // an old airfield, nearly flat: a gentle crest after the esses, rising along the longest straight, down through the last complex
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
  // on the outside, along the start straight: out of the last complex's long right, back in before the fast right
  pit: { from: -380, to: 220, side: -1 },
};

/**
 * Harbour. Clockwise through the streets of a harbour town, after the most
 * famous street circuit of all (its corners in order, eased apart so our wider
 * track fits between the walls; the outline after github.com/bacinger/f1-circuits,
 * MIT): the main straight beside the harbour, a tight right at the first
 * corner, the climb up the hill, a long left and a right flick across the
 * square at the top, down to a tight right, the slowest hairpin anywhere, two
 * rights to the sea front, the long right-curving tunnel, the chicane at its
 * exit, a fast left along the quay, the pool's left–right and right–left, the
 * tight right at the bottom and the last right onto the straight. Walls all
 * the way round, a step off the track.
 */
export const HARBOUR: CircuitLayout = {
  id: 'harbour',
  name: 'Harbour',
  about: 'clockwise · tight streets, walls close',
  points: ([
    // the main straight, north, the pits on the harbour side
    [500, 2000], [500, 1760],
    // the first corner: a right
    [512, 1620], [560, 1535], [650, 1480],
    // the climb up the hill, north-east
    [800, 1400], [1050, 1250], [1300, 1080], [1480, 950],
    // the long left
    [1580, 860], [1630, 760], [1645, 660],
    // the right flick across the square
    [1680, 590], [1760, 560],
    // down to the tight right
    [1900, 565], [2010, 600], [2060, 680],
    [2070, 800], [2060, 900],
    // the hairpin: left, round to heading back north
    [2080, 980], [2140, 1010], [2200, 990], [2225, 920],
    // two rights to the sea front
    [2240, 840], [2300, 790], [2380, 790],
    [2450, 830], [2490, 920],
    // the tunnel: a long right along the coast
    [2500, 1100], [2470, 1350], [2390, 1600], [2260, 1830], [2100, 2000],
    // the chicane: left, right
    [1990, 2090], [1960, 2160], [1900, 2210], [1820, 2220],
    // along the quay, then the fast left
    [1500, 2210], [1150, 2190], [1000, 2210], [930, 2290],
    // the pool: left–right, then right–left
    [905, 2450], [915, 2560], [935, 2650], [935, 2740],
    [915, 2830], [905, 2930], [905, 3030],
    // down to the tight right at the bottom, and the last right
    [905, 3250], [885, 3390], [830, 3470], [720, 3490],
    [610, 3480], [530, 3430], [505, 3330],
    // back up the straight
    [500, 3000], [500, 2600], [500, 2300],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 1,
  // up from the harbour to the square at the top, down to the sea front, flat round the harbour
  elevation: [
    [0, 10],
    [0.05, 12],
    [0.16, 44],
    [0.23, 62],
    [0.28, 54],
    [0.33, 38],
    [0.39, 16],
    [0.5, 8],
    [0.6, 6],
    [0.9, 8],
    [1, 10],
  ],
  // on the harbour side of the straight
  pit: { from: -1000, to: 380, side: 1 },
  // slow streets, easy on tyres: track position is everything
  tyreWear: 0.3,
  street: {
    runoff: 28,
    // the harbour, beyond the quay and the pool, and the sea along the coast past the tunnel
    sea: ([
      [1000, 2300], [1750, 2300], [2150, 2130], [2420, 1820], [2580, 1300], [2620, 700],
      [3400, 700], [3400, 4200], [1000, 4200],
    ] as [number, number][]).map(([x, y]) => ({ x, y })),
    tunnel: [3500, 4500],
  },
};

export const LAYOUTS: CircuitLayout[] = [CRESCENT_PARK, SILVER_HEATH, HARBOUR];

/** The layout with this id, or undefined. */
export function layoutById(id: string | null | undefined): CircuitLayout | undefined {
  return LAYOUTS.find((l) => l.id === id);
}
