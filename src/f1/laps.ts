// How long a race is. A Championship round is always RACE_LAPS, so a season's
// rounds are alike; a Quick Race is as many laps as the menu's LAPS row says
// (remembered, in the save's choices). Five laps is long enough that worn tyres
// make a pit stop worth it (a set lasts about two laps at its best).

export const RACE_LAPS = 5;

/** The race lengths the LAPS row steps through. */
export const LAP_CHOICES = [1, 2, 3, 5, 7, 10, 15, 20] as const;

/** A saved race length, if it's one of the choices; else the default. */
export function lapsFrom(saved: unknown): number {
  const n = Number(saved);
  return (LAP_CHOICES as readonly number[]).includes(n) ? n : RACE_LAPS;
}

/** A short line about a race of `n` laps, for the menu. */
export function lapsAbout(n: number): string {
  if (n === 1) return 'a sprint, flat out';
  if (n <= 3) return 'short: no tyre stop';
  if (n <= 5) return 'a tyre stop pays';
  if (n <= 10) return 'one or two tyre stops';
  return 'endurance: stops, strategy';
}
