// Your records, kept on the device between races: the best lap on each
// circuit, and the best race time on each circuit for each number of laps
// (penalties included). Engine-free and unit-tested; the race saves a lap as
// soon as it's done, so a record isn't lost by quitting mid-race.

import { storeKey } from '../engine/storage';

export interface CircuitRecords {
  /** seconds: your fastest lap here */
  bestLap?: number;
  /** seconds: your fastest finish here, by the race's number of laps */
  bestRace: Record<number, number>;
}

export interface Records {
  /** the save's format, so a later version can read an old save */
  version: 1;
  circuits: Record<string, CircuitRecords>;
}

/** A time as m:ss.hh ('–' for none). */
export const formatTime = (s?: number) => (s === undefined ? '–' : `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`);

export const emptyRecords = (): Records => ({ version: 1, circuits: {} });

const time = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** Records from saved JSON, keeping whatever is valid and dropping the rest (a corrupt save gives none). */
export function parseRecords(saved: string | null): Records {
  const out = emptyRecords();
  if (!saved) return out;
  try {
    const raw = JSON.parse(saved) as { circuits?: Record<string, { bestLap?: unknown; bestRace?: Record<string, unknown> }> };
    for (const [id, c] of Object.entries(raw?.circuits ?? {})) {
      if (!c || typeof c !== 'object') continue;
      const bestRace: Record<number, number> = {};
      for (const [laps, t] of Object.entries(c.bestRace ?? {})) {
        const n = Number(laps);
        const v = time(t);
        if (Number.isInteger(n) && n > 0 && v !== undefined) bestRace[n] = v;
      }
      out.circuits[id] = { bestLap: time(c.bestLap), bestRace };
    }
  } catch {
    // corrupt save: start afresh
  }
  return out;
}

const circuit = (r: Records, id: string): CircuitRecords => (r.circuits[id] ??= { bestRace: {} });

/** Note a lap on circuit `id`; true if it's a new best (the first lap there counts). */
export function recordLap(r: Records, id: string, seconds: number): boolean {
  const c = circuit(r, id);
  if (c.bestLap !== undefined && c.bestLap <= seconds) return false;
  c.bestLap = seconds;
  return true;
}

/** Note a finish of `laps` laps on circuit `id`; true if it's a new best for that length of race. */
export function recordRace(r: Records, id: string, laps: number, seconds: number): boolean {
  const c = circuit(r, id);
  const best = c.bestRace[laps];
  if (best !== undefined && best <= seconds) return false;
  c.bestRace[laps] = seconds;
  return true;
}

const KEY = () => storeKey('records');

/** The records saved on this device (none if storage is blocked). */
export function loadRecords(): Records {
  try {
    return parseRecords(localStorage.getItem(KEY()));
  } catch {
    return emptyRecords();
  }
}

/** Keep `r` on this device (quietly not, if storage is blocked or full). */
export function saveRecords(r: Records): void {
  try {
    localStorage.setItem(KEY(), JSON.stringify(r));
  } catch {
    // storage unavailable: the records last until the page closes
  }
}
