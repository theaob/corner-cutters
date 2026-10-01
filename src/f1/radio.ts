// The team radio: your race engineer on the moments that matter (box, box; the
// safety car and the virtual one, and the green; a good stop; the last lap; a
// purple lap; track limits; a wreck; and how it went at the flag), a line at a
// time, each said a few ways so it doesn't repeat itself. The race shows the
// line in a radio panel, keyed with a click and a squelch, and holds the next
// until it's done (and drops a stale one). Engine-free and unit-tested.

export type RadioCue = 'box' | 'safety-car' | 'vsc' | 'green' | 'pit-out' | 'final-lap' | 'fastest-lap' | 'warning' | 'penalty' | 'wreck';

export const RADIO_LINES: Record<RadioCue, string[]> = {
  box: ['BOX, BOX. BOX THIS LAP.', 'BOX, BOX. PIT THIS LAP.', 'BOX NOW, BOX NOW.'],
  'safety-car': ['SAFETY CAR, SAFETY CAR. HOLD POSITION.', 'SAFETY CAR DEPLOYED. NO OVERTAKING.', 'SAFETY CAR. STAY BEHIND, KEEP THE TYRES WARM.'],
  vsc: ['VSC, VSC. KEEP TO THE LIMIT.', 'VIRTUAL SAFETY CAR. NO OVERTAKING.'],
  green: ['GREEN, GREEN, GREEN. GO!', 'GREEN FLAG. PUSH NOW.', "WE'RE GREEN. RACE ON."],
  'pit-out': ['GOOD STOP. PUSH NOW.', 'GREAT STOP. GO, GO, GO.', 'NICE STOP. NOW PUSH.'],
  'final-lap': ['LAST LAP. BRING IT HOME.', 'FINAL LAP. KEEP IT CLEAN.', 'LAST LAP. GIVE IT EVERYTHING.'],
  'fastest-lap': ["PURPLE! THAT'S FASTEST LAP.", 'FASTEST LAP. GREAT PACE.', 'MEGA LAP. FASTEST OF THE RACE.'],
  warning: ['TRACK LIMITS. CAREFUL.', 'WATCH THE TRACK LIMITS.', 'THAT ONE WAS A WARNING. KEEP IT ON THE TRACK.'],
  penalty: ["THAT'S A FIVE SECOND PENALTY.", 'PENALTY FOR TRACK LIMITS. KEEP IT CLEAN NOW.'],
  wreck: ['ARE YOU OK? THE CAR IS DONE.', "YOU OK? WE'RE OUT, I'M SORRY.", "SORRY MATE, THAT'S THE RACE."],
};

/** A line for `cue`, one of its ways round (picked by `rng`). */
export function radioLine(cue: RadioCue, rng: () => number = Math.random): string {
  const lines = RADIO_LINES[cue];
  return lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))];
}

/** What your engineer says at your flag, finishing `place` (1 = the winner) of `of`. */
export function finishLine(place: number, of: number, rng: () => number = Math.random): string {
  const pick = (lines: string[]) => lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))];
  if (place === 1) return pick(['YES! GET IN THERE! P1!', 'P1! YOU WON IT! WHAT A RACE!', 'CHEQUERED FLAG, P1! FANTASTIC!']);
  if (place <= 3) return pick([`P${place}! PODIUM! GREAT JOB.`, `PODIUM, P${place}. WELL DONE.`]);
  if (place <= Math.min(10, of)) return pick([`P${place}. GOOD POINTS TODAY.`, `P${place}, IN THE POINTS. NICE WORK.`]);
  return pick([`P${place}. WE'LL GO AGAIN.`, `P${place}. TOUGH ONE, WE'LL LEARN FROM IT.`]);
}

/** s a line stays up (longer lines a little longer), and the most a line may wait behind another before it's stale. */
export const RADIO = { least: 2.2, perChar: 0.035, stale: 4 };

/** s the panel stays up for `text`. */
export const radioFor = (text: string): number => RADIO.least + text.length * RADIO.perChar;

export interface RadioQueue {
  /** the line up now, and the s it has left */
  now?: { text: string; left: number };
  /** lines waiting, each with how long it has waited (s) */
  waiting: { text: string; waited: number }[];
}

export const newRadio = (): RadioQueue => ({ waiting: [] });

/** Say `text` (now if the radio's free, else after what's up, unless it's said already). */
export function say(q: RadioQueue, text: string): void {
  if (q.now?.text === text || q.waiting.some((w) => w.text === text)) return;
  q.waiting.push({ text, waited: 0 });
}

/** Move the radio on `dt` s: the line up runs down; the next goes up when it's done (stale ones dropped). The line that went up now, if one did. */
export function stepRadio(q: RadioQueue, dt: number): string | undefined {
  if (q.now) {
    q.now.left -= dt;
    if (q.now.left <= 0) q.now = undefined;
  }
  for (const w of q.waiting) w.waited += dt;
  q.waiting = q.waiting.filter((w) => w.waited <= RADIO.stale);
  if (q.now || !q.waiting.length) return undefined;
  const next = q.waiting.shift()!;
  q.now = { text: next.text, left: radioFor(next.text) };
  return next.text;
}
