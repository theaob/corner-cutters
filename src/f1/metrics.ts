// The anonymous play stats (supabase/README.md): the game launched, a race
// started and finished (its mode and circuit), the km you've driven, a result
// shared. Queued and sent every so often (and as the page closes), by a random
// id the device made for itself; nothing at all when STATS is off in the
// settings, or the build has no backend.

import { Capacitor } from '@capacitor/core';
import { insert, online } from '../engine/backend';
import { playerId, statsOn } from './profile';

export type EventKind = 'launch' | 'race_start' | 'race_finish' | 'drive' | 'share' | 'daily_submit' | 'session';

/** m of the real world in a px of track (Silver Heath's 8,800 px lap is the 5.9 km circuit it's traced from). */
export const METRES_PER_PX = 0.67;

/** s between sends */
const EVERY = 20;

interface Event {
  at: string;
  player: string;
  kind: EventKind;
  platform: 'web' | 'android';
  version: string;
  circuit?: string;
  mode?: string;
  km?: number;
  /** s in the app (a 'session' event: since the last one, while the page was showing) */
  seconds?: number;
  data?: Record<string, unknown>;
}

const queue: Event[] = [];
let timer: ReturnType<typeof setInterval> | undefined;

/** The build's version (package version and commit). */
const version = (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev').slice(0, 40);

/** Send what's queued (`closing`: the page is going, so with keepalive). */
export function flush(closing = false): void {
  if (!queue.length) return;
  const rows = queue.splice(0);
  // (the time in the game goes on its own: a project whose schema is older than it refuses it, and only it)
  for (const batch of [rows.filter((r) => r.kind !== 'session'), rows.filter((r) => r.kind === 'session')]) {
    if (!batch.length) continue;
    void insert('events', batch, closing).then((ok) => {
      // (not sent: kept for the next try, unless the page is going)
      if (!ok && !closing && queue.length < 200) queue.unshift(...batch);
    });
  }
}

/** Note `kind` (with what it was about). */
export function track(kind: EventKind, about: { circuit?: string; mode?: string; km?: number; seconds?: number; data?: Record<string, unknown> } = {}): void {
  if (!online() || !statsOn()) return;
  queue.push({
    at: new Date().toISOString(), player: playerId(), kind, platform: Capacitor.isNativePlatform() ? 'android' : 'web', version: version(),
    ...about, ...(about.km !== undefined ? { km: Math.round(about.km * 1000) / 1000 } : {}),
  });
  if (!timer) {
    timer = setInterval(() => flush(), EVERY * 1000);
    // (as the page is hidden or closed: the time in the app since the last time, then what's queued, goes now)
    const away = () => {
      noteTime();
      flush(true);
    };
    document.addEventListener('visibilitychange', () => (document.hidden ? away() : (shownAt = performance.now())));
    window.addEventListener('pagehide', away);
  }
}

/** this launch of the game (its time in the app is summed by it), and when the page was last shown (ms) */
const launch = Math.random().toString(36).slice(2, 12);
let shownAt: number | undefined;

/** Start timing the time in the app (from the launch, while the page is showing). */
export function startClock(): void {
  shownAt = typeof document !== 'undefined' && document.hidden ? undefined : performance.now();
}

/** The time in the app since it was last shown, as a 'session' event of this launch (a second at least). */
function noteTime(): void {
  if (shownAt === undefined) return;
  const seconds = (performance.now() - shownAt) / 1000;
  shownAt = undefined;
  if (seconds >= 1) track('session', { seconds: Math.round(Math.min(seconds, 86400)), data: { launch } });
}

/** The km in `px` of driving. */
export const kmOf = (px: number) => (px * METRES_PER_PX) / 1000;
