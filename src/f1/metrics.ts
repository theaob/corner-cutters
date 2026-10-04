// The anonymous play stats (supabase/README.md): the game launched, a race
// started and finished (its mode and circuit), the km you've driven, a result
// shared. Queued and sent every so often (and as the page closes), by a random
// id the device made for itself; nothing at all when STATS is off in the
// settings, or the build has no backend.

import { Capacitor } from '@capacitor/core';
import { insert, online } from '../engine/backend';
import { playerId, statsOn } from './profile';

export type EventKind = 'launch' | 'race_start' | 'race_finish' | 'drive' | 'share' | 'daily_submit';

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
  void insert('events', rows, closing).then((ok) => {
    // (not sent: kept for the next try, unless the page is going)
    if (!ok && !closing && queue.length < 200) queue.unshift(...rows);
  });
}

/** Note `kind` (with what it was about). */
export function track(kind: EventKind, about: { circuit?: string; mode?: string; km?: number; data?: Record<string, unknown> } = {}): void {
  if (!online() || !statsOn()) return;
  queue.push({
    at: new Date().toISOString(), player: playerId(), kind, platform: Capacitor.isNativePlatform() ? 'android' : 'web', version: version(),
    ...about, ...(about.km !== undefined ? { km: Math.round(about.km * 1000) / 1000 } : {}),
  });
  if (!timer) {
    timer = setInterval(() => flush(), EVERY * 1000);
    // (as the page is hidden or closed: what's queued goes now)
    document.addEventListener('visibilitychange', () => document.hidden && flush(true));
    window.addEventListener('pagehide', () => flush(true));
  }
}

/** The km in `px` of driving. */
export const kmOf = (px: number) => (px * METRES_PER_PX) / 1000;
