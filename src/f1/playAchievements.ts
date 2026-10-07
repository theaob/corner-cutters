// The achievements on Google Play Games, in the Google Play build of the app:
// each one unlocked in the game is unlocked on the player's Play Games profile
// too (Play shows its own pop-up), and those earned before signing in are sent
// once they are. The game keeps its own record either way (achievements.ts);
// a player who never signs in loses nothing. Every other build has none of it.
// Engine-free but for the bridge it's given (src/engine/playGames.ts in the app).

import type { PlayGamesBridge } from '../engine/playGames';

export type { PlayGamesBridge };

/**
 * Each achievement's id on Play Games (the Play Console makes them, "CgkI…", on creating each achievement there:
 * Play Games Services → Achievements; the export of its resources lists them). One left out isn't sent.
 */
export const PLAY_ACHIEVEMENT_IDS: Readonly<Record<string, string>> = {};


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

/** Play Games' achievements through `bridge`, `ids` mapping the game's to Play's. */
export function playAchievements(bridge: PlayGamesBridge, ids: Readonly<Record<string, string>> = PLAY_ACHIEVEMENT_IDS): PlayAchievements {
  let available = false;
  let signedIn = false;
  const send = async (list: string[]) => {
    if (!signedIn) return;
    for (const id of list) {
      const play = ids[id];
      if (play) await bridge.unlock({ id: play }).catch(() => {});
    }
  };
  return {
    available: () => available,
    signedIn: () => signedIn,
    async start(unlocked) {
      const s = await bridge.start().catch(() => ({ available: false, signedIn: false }));
      available = s.available;
      signedIn = s.available && s.signedIn;
      await send(unlocked);
    },
    report: send,
    async show(unlocked) {
      if (!available) return false;
      if (!signedIn) {
        const s = await bridge.signIn().catch(() => ({ available, signedIn: false }));
        signedIn = s.signedIn;
        if (!signedIn) return false;
        await send(unlocked);
      }
      return bridge.showAchievements().then(() => true, () => false);
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
