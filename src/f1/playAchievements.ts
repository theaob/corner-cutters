// The achievements on Google Play Games, in the Google Play build of the app:
// each one unlocked in the game is unlocked on the player's Play Games profile
// too (Play shows its own pop-up), and those earned before signing in are sent
// once they are. The game keeps its own record either way (achievements.ts);
// a player who never signs in loses nothing. Every other build has none of it.
// Engine-free but for the bridge it's given (src/engine/playGames.ts in the app).

import type { PlayGamesBridge } from '../engine/playGames';
import { note } from '../engine/logbook';
import { ACHIEVEMENTS } from './achievements';

export type { PlayGamesBridge };

/**
 * Each achievement's id on Play Games, where it's known here (the Play Console makes them, "CgkI…": the export of its
 * resources lists them). One left out is found by its name instead: Play Games lists the game's achievements, with
 * their ids, once the player's signed in.
 */
export const PLAY_ACHIEVEMENT_IDS: Readonly<Record<string, string>> = {};

/** A name as matched with Play's: letters and digits only, in capitals (Play allows no commas: "BOX, BOX" is "BOX BOX" there). */
export const matchName = (name: string): string => name.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The game's achievements' names, by id. */
const NAMES: Readonly<Record<string, string>> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a.name]));


export interface PlayAchievements {
  /** Play Games is there (the Play build, set up in the Console) */
  available(): boolean;
  signedIn(): boolean;
  /** start up (Google signs the player in on its own if it can) and send `unlocked`, all earned so far */
  start(unlocked: string[]): Promise<void>;
  /** send these, just unlocked */
  report(ids: string[]): Promise<void>;
  /** Google's achievements screen (signing in first, by hand, if need be); `unlocked` sent on a fresh sign-in */
  show(unlocked: string[]): Promise<boolean>;
}

/**
 * Play Games' achievements through `bridge`, `ids` mapping the game's to Play's; those not in it found on Play by
 * their `names`.
 */
export function playAchievements(
  bridge: PlayGamesBridge,
  ids: Readonly<Record<string, string>> = PLAY_ACHIEVEMENT_IDS,
  names: Readonly<Record<string, string>> = NAMES,
): PlayAchievements {
  let available = false;
  let signedIn = false;
  /** Play's ids by matched name, as Play Games listed them (asked once signed in; again if it couldn't say) */
  let byName: Map<string, string> | undefined;
  const playId = async (id: string): Promise<string | undefined> => {
    if (ids[id]) return ids[id];
    if (!byName && bridge.list) {
      try {
        const { achievements } = await bridge.list();
        byName = new Map(achievements.map((a) => [matchName(a.name), a.id]));
        note(`play games: ${achievements.length} achievements listed`);
      } catch (e) {
        note(`play games: no list (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    return byName?.get(matchName(names[id] ?? ''));
  };
  const send = async (list: string[]) => {
    if (!signedIn) return;
    let sent = 0;
    for (const id of list) {
      const play = await playId(id);
      if (!play) {
        note(`play games: no achievement for ${id}`);
        continue;
      }
      await bridge.unlock({ id: play }).then(() => sent++, (e) => note(`play games: unlock ${id} failed (${e instanceof Error ? e.message : String(e)})`));
    }
    if (list.length) note(`play games: ${sent} of ${list.length} sent`);
  };
  return {
    available: () => available,
    signedIn: () => signedIn,
    async start(unlocked) {
      const s = await bridge.start().catch(() => ({ available: false, signedIn: false }));
      available = s.available;
      signedIn = s.available && s.signedIn;
      note(`play games: ${available ? (signedIn ? 'signed in' : 'not signed in') : 'not available'}`);
      await send(unlocked);
    },
    report: send,
    async show(unlocked) {
      if (!available) return false;
      if (!signedIn) {
        const s = await bridge.signIn().catch(() => ({ available, signedIn: false }));
        signedIn = s.signedIn;
        note(`play games: sign-in ${signedIn ? 'done' : 'failed'}`);
        if (!signedIn) return false;
        await send(unlocked);
      }
      return bridge.showAchievements().then(() => true, (e) => {
        note(`play games: no achievements screen (${e instanceof Error ? e.message : String(e)})`);
        return false;
      });
    },
  };
}

let shared: PlayAchievements | undefined;

/** Play Games for the whole app (the Play build sets it up on start), if this build has it. */
export const sharedPlayAchievements = (): PlayAchievements | undefined => shared;

/** Set up the app's Play Games through `bridge` (once) and start it with `unlocked`. */
export function startPlayAchievements(bridge: PlayGamesBridge, unlocked: string[]): PlayAchievements {
  shared ??= playAchievements(bridge);
  void shared.start(unlocked);
  return shared;
}
