// The teams: a name, a three-letter code for the timing screens, and a livery
// (body, trim, and an optional third colour for the sidepods). A race runs five
// of them, two cars each: yours (you and an AI teammate) and four drawn at random.

export interface Team {
  id: string;
  /** three letters, for the timing screens */
  code: string;
  name: string;
  /** main colour */
  body: string;
  /** wings and nose */
  trim: string;
  /** sidepods, when the livery has a third colour */
  accent?: string;
}

export const TEAMS: Team[] = [
  { id: 'milk-energy', code: 'MLK', name: 'Milk Energy', body: '#1e2b5c', trim: '#f2c14e' },
  { id: 'prancing-monkey', code: 'PRM', name: 'Prancing Monkey', body: '#dc0000', trim: '#fff200' },
  { id: 'golden-arrows', code: 'GOA', name: 'Golden Arrows', body: '#c6c9d0', trim: '#00d2be' },
  { id: 'calrissian', code: 'CAL', name: 'Calrissian Racing', body: '#ff8000', trim: '#1b1b26' },
  { id: 'british-lime', code: 'BLI', name: 'British Lime', body: '#00594f', trim: '#cedc00' },
  { id: 'renee', code: 'REN', name: 'Reneé', body: '#f7d117', trim: '#1b1b26' },
  { id: 'frankies-groove', code: 'FRG', name: "Frankie's Groove", body: '#1868db', trim: '#f4f4f8' },
  { id: 'cheaper-milk', code: 'CHM', name: 'Cheaper Milk', body: '#f4f4f8', trim: '#1634cc' },
  { id: 'dmw', code: 'DMW', name: 'DMW – DEUTCHE MOTOR WERKE', body: '#1c69d4', trim: '#f4f4f8' },
  { id: 'maas', code: 'MAS', name: 'MaaS', body: '#f4f4f8', trim: '#d8323c', accent: '#8a8d94' },
  { id: 'grandmas-fave', code: 'GMF', name: "Grandma's Fave", body: '#1b1b26', trim: '#f4f4f8' },
];

/** How many teams race at once, two cars each. */
export const TEAMS_PER_RACE = 5;

/** The team with this id, or undefined. */
export const teamById = (id: string | null | undefined) => TEAMS.find((t) => t.id === id);

/** A shuffled copy of `list` (Fisher–Yates), with `rng` returning 0 ≤ x < 1. */
function shuffled<T>(list: T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Each grid slot's team, for `total` cars with the player in slot `you`: the
 * player's team fills two cars (the teammate somewhere else on the grid), and
 * four teams drawn at random fill the rest, two cars each, in a shuffled order.
 */
export function teamGrid(yours: Team, total: number, you: number, rng: () => number = Math.random): Team[] {
  const rivals = shuffled(TEAMS.filter((t) => t !== yours), rng).slice(0, TEAMS_PER_RACE - 1);
  // the other cars: your teammate first, then each rival twice, as many as there are seats
  const cars = [yours, ...rivals.flatMap((t) => [t, t])].slice(0, Math.max(0, total - 1));
  const others = shuffled(cars, rng);
  return Array.from({ length: total }, (_, i) => (i === you ? yours : others[i < you ? i : i - 1]));
}
