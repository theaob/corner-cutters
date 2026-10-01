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
  /** a banked bend: px along the lap (from, to), and how steeply the track tilts up toward the outside (rise per px across, at its steepest) */
  banking?: { from: number; to: number; grade: number };
  /** in a forest: trees packed all round beyond the barriers, on a dark forest floor */
  forest?: boolean;
  /** the podium hangs over the main straight on a deck from the pit side, this many px up (else it stands on the run-off) */
  podiumDeck?: number;
}

export interface StreetSpec {
  runoff: number;
  sea: Pt[];
  tunnel: [number, number];
  /** where its landmarks stand (in `points` units): the casino, an open-air swimming pool, a tennis court */
  landmarks?: { casino: Pt; pool: Pt; tennis: Pt };
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
    { x: 2300, y: 750 },
    { x: 2300, y: 500 },
    // T1: downhill left
    { x: 2270, y: 270 },
    { x: 2170, y: 190 },
    // T2: right
    { x: 2040, y: 180 },
    { x: 1960, y: 100 },
    // T3: long fast left
    { x: 1850, y: 10 },
    { x: 1680, y: 10 },
    { x: 1560, y: 90 },
    // T4–T7: the twisty middle
    { x: 1440, y: 220 },
    { x: 1330, y: 360 },
    { x: 1180, y: 400 },
    { x: 1030, y: 340 },
    { x: 890, y: 390 },
    { x: 720, y: 500 },
    // T8: the long four-apex left, round the west end
    { x: 540, y: 520 },
    { x: 380, y: 600 },
    { x: 290, y: 780 },
    { x: 288, y: 975 },
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
    [0.089, 24],
    [0.127, 4],
    [0.183, 2],
    [0.257, 18],
    [0.369, 14],
    [0.463, 6],
    [0.608, 20],
    [0.72, 12],
    [0.851, 10],
    [0.944, 18],
    [1, 22],
  ],
  // on the infield, from the chicane's exit to the run up to T1
  pit: { from: -232, to: 840, side: -1 },
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
    [451, 636], [487, 589], [524, 542], [564, 499], [611, 470], [666, 460],
    [725, 462], [783, 460], [838, 444], [889, 415], [937, 380], [984, 352],
    [1026, 351], [1059, 381], [1088, 410], [1118, 403], [1140, 361], [1146, 306],
    [1130, 255], [1094, 210], [1051, 169], [1007, 129], [963, 88], [918, 48],
    [874, 8], [829, -33], [785, -73], [740, -113], [694, -149], [645, -171],
    [600, -164], [568, -128], [543, -84], [510, -62], [478, -78], [472, -122],
    [489, -175], [518, -227], [553, -274], [597, -312], [649, -338], [706, -352],
    [766, -360], [825, -366], [885, -371], [945, -376], [1005, -381], [1063, -381],
    [1117, -367], [1159, -333], [1186, -284], [1203, -227], [1217, -169], [1226, -109],
    [1231, -50], [1235, 10], [1239, 70], [1249, 128], [1264, 184], [1271, 240],
    [1264, 297], [1258, 354], [1266, 409], [1282, 462], [1280, 513], [1252, 557],
    [1209, 596], [1169, 638], [1136, 687], [1107, 740], [1078, 792], [1049, 845],
    [1021, 898], [992, 950], [963, 1003], [927, 1051], [892, 1099], [856, 1147], [820, 1195], [785, 1244], [749, 1292], [713, 1340], [678, 1388], [642, 1436], [613, 1489], [582, 1541],
    [550, 1591], [515, 1638], [472, 1672], [422, 1681], [375, 1660], [339, 1617],
    [307, 1568], [272, 1520], [233, 1474], [193, 1431], [151, 1396], [106, 1382],
    [60, 1374], [22, 1344], [0, 1296], [2, 1243], [27, 1192], [61, 1144],
    [97, 1096], [134, 1049], [198, 966], [262, 882], [326, 798], [388, 717],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 1.6,
  // an old airfield, nearly flat: a gentle crest after the esses, rising along the longest straight, down through the last complex
  elevation: [
    [0, 10],
    [0.085, 12],
    [0.171, 6],
    [0.272, 4],
    [0.383, 10],
    [0.511, 22],
    [0.561, 18],
    [0.772, 26],
    [0.84, 14],
    [1, 10],
  ],
  // on the outside, along the start straight: out of the last complex's long right, back in before the fast right
  pit: { from: -880, to: 192, side: -1 },
  // (wear runs by the second: a set lasts the same three laps as on the shorter circuits)
  tyreWear: 0.85,
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
  pit: { from: -1000, to: 272, side: 1 },
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
    // the casino above the hairpin, the pool at the foot of the pool section, the tennis court beside the climb: each
    // beside a stretch of track that runs across the screen, where the camera has room to show it
    landmarks: { casino: { x: 2240, y: 626 }, pool: { x: 756, y: 3220 }, tennis: { x: 846, y: 1584 } },
  },
};

/**
 * Royal Park. Clockwise through an old royal park, after the temple of speed
 * (its corners in order, eased for the arcade handling): the longest straight
 * of all, the first chicane (right–left), the long right of the big curve, the
 * second chicane (left–right), the two rights of the woods, the straight under
 * the trees, the fast left–right–left chicane, the back straight, and the
 * banking: a long right of a half circle, tilted up to the outside, flat out
 * onto the main straight. The podium hangs out over the main straight.
 */
export const ROYAL_PARK: CircuitLayout = {
  id: 'royal-park',
  name: 'Royal Park',
  about: 'clockwise · the banking, the longest straight',
  points: ([
    // the main straight, east, the pits on the outside (north)
    [1000, 300], [1500, 300], [2000, 300], [2440, 300],
    // the first chicane: a hard right, then left
    [2500, 304], [2530, 330], [2545, 370], [2565, 400], [2605, 414], [2680, 420], [2760, 430],
    // the big curve: a long right, round to heading south
    [2880, 475], [3000, 535], [3090, 625], [3140, 745], [3150, 875],
    // the second chicane: left, right
    [3150, 960], [3158, 990], [3185, 1010], [3208, 1035], [3215, 1075], [3200, 1125], [3180, 1170],
    // the woods: two rights, round to heading west
    [3150, 1225], [3100, 1275], [3030, 1305],
    [2960, 1340], [2900, 1380], [2820, 1390],
    // the straight under the trees
    [2500, 1380], [2150, 1340],
    // the fast chicane: left, right, left
    [2050, 1330], [1980, 1360], [1900, 1380], [1820, 1360], [1760, 1310], [1680, 1280],
    // the back straight, toward the main one
    [1400, 1200], [1100, 1080],
    // the banking: a half circle round to heading east
    [880, 990], [700, 940], [530, 900], [420, 800], [380, 650], [410, 490], [500, 370], [620, 310],
    // onto the main straight
    [800, 300],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 1.4,
  // a park: nearly flat, a little rise through the woods
  elevation: [
    [0, 8],
    [0.2, 10],
    [0.4, 18],
    [0.55, 14],
    [0.75, 6],
    [1, 8],
  ],
  pit: { from: -400, to: 1100, side: -1 },
  // (from the back straight's end round to the main straight)
  banking: { from: 7700, to: 9100, grade: 0.3 },
  podiumDeck: 46,
};

/**
 * Ardennes. Clockwise, up and down through a forest in the Ardennes, traced
 * from the most famous circuit in those hills (outline data from
 * github.com/bacinger/f1-circuits, MIT), and the longest lap of all: from the
 * line, the tight right of the hairpin, the plunge down past the pits to the
 * bottom of the valley, the left–right–left of the steepest climb anywhere,
 * the long climb of the straight to the top of the hill, the right–left
 * chicane and the right after it, the long right of the second hairpin, down
 * through the double-apex left, the right–left in the woods and the two
 * rights at the bottom of the valley, the long, flat-out climb back through
 * the left kinks, and the right–left of the last chicane onto the straight.
 */
export const ARDENNES: CircuitLayout = {
  id: 'ardennes',
  name: 'Ardennes',
  about: 'clockwise · the longest, up and down through the forest',
  points: ([
    [227, -50], [161, -162], [135, -215], [139, -249], [165, -263], [199, -249],
    [268, -202], [311, -175], [357, -142], [417, -74], [450, -39], [489, 16],
    [528, 70], [566, 125], [605, 180], [644, 235], [682, 290], [721, 344],
    [760, 399], [793, 424], [831, 448], [847, 464], [861, 486], [875, 528],
    [884, 580], [984, 751], [1038, 837], [1053, 870], [1063, 894], [1074, 932],
    [1143, 1169], [1248, 1529], [1270, 1612], [1268, 1645], [1250, 1672], [1230, 1694],
    [1222, 1722], [1236, 1821], [1236, 1858], [1220, 1886], [1180, 1914], [968, 2043],
    [932, 2056], [898, 2046], [880, 2016], [884, 1982], [910, 1954], [950, 1930],
    [1025, 1892], [1042, 1869], [1044, 1839], [1000, 1713], [987, 1661], [956, 1502],
    [941, 1411], [930, 1379], [905, 1351], [870, 1332], [788, 1325], [764, 1328],
    [742, 1334], [720, 1343], [681, 1375], [668, 1394], [653, 1421], [594, 1568],
    [541, 1699], [526, 1724], [496, 1744], [462, 1750], [430, 1741], [404, 1728],
    [371, 1720], [338, 1726], [309, 1748], [212, 1898], [186, 1924], [150, 1934],
    [112, 1918], [69, 1880], [31, 1847], [11, 1819], [1, 1787], [3, 1748],
    [18, 1707], [31, 1671], [54, 1631], [79, 1596], [117, 1554], [180, 1493],
    [217, 1464], [248, 1446], [410, 1362], [434, 1347], [456, 1330], [476, 1311],
    [494, 1290], [510, 1268], [532, 1228], [550, 1190], [590, 1101], [601, 1060],
    [602, 1034], [598, 1011], [574, 950], [548, 883], [517, 799], [509, 768],
    [501, 731], [496, 696], [494, 667], [489, 580], [496, 545], [522, 524],
    [548, 500], [544, 466], [491, 404], [456, 344], [421, 284], [386, 224],
    [352, 164], [317, 104], [282, 44],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 1.8,
  // (metres along the lap / 6954 m): the hairpin at the top, down to the bottom of the valley, straight up the
  // steepest climb, on up the long straight to the top of the hill, down and down to the far end of the valley,
  // and the long climb back
  elevation: [
    [0, 44],
    [0.033, 48],
    [0.078, 40],
    [0.161, 0],
    [0.195, 56],
    [0.243, 74],
    [0.339, 116],
    [0.371, 110],
    [0.424, 92],
    [0.456, 76],
    [0.528, 48],
    [0.622, 24],
    [0.695, 4],
    [0.807, 22],
    [0.886, 36],
    [0.913, 42],
    [0.976, 44],
    [1, 44],
  ],
  // on the outside of the straight, from the last chicane to the line
  pit: { from: -856, to: 240, side: -1 },
  // (the longest lap: a set lasts three laps, so a 5-lap race needs one stop at most)
  tyreWear: 0.4,
  forest: true,
};

export const LAYOUTS: CircuitLayout[] = [CRESCENT_PARK, SILVER_HEATH, HARBOUR, ROYAL_PARK, ARDENNES];

/** The layout with this id, or undefined. */
export function layoutById(id: string | null | undefined): CircuitLayout | undefined {
  return LAYOUTS.find((l) => l.id === id);
}
