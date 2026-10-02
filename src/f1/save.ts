// Corner Cutters' save format (engine/save.ts keeps it): its version, and how
// an older save is brought up to date. Sections:
//   settings  sound (0…1), vibration (on/off), stickSide ('left'/'right'), layout ('handheld'/'desktop')
//   choices   the menu's last mode ('race'/'timetrial'), circuit, team, difficulty and weather (by id), qualifying ('on'/'off'), a Quick Race's laps ('5'), and the time ('day'/'night')
//   ghosts    your best Time Trial lap on each circuit (and weather), to race as a ghost (timeTrial.ts)
//   championship  season: the Championship season in progress (or just over) (championship.ts)
//   progress  unlocked: the circuits a Championship has unlocked (unlocks.ts); onboarded: the controls lap done or skipped;
//             championship: true once the Championship is bought (the Google Play build: purchase.ts)
//   records   circuits: best race lap, best qualifying lap and best race times per circuit (records.ts)
//   trophies  medals: your best Time Trial and Time Attack medal on each circuit; titles: Championships won (medals.ts)
//             achievements: those unlocked, and raced: the circuits you've raced on (achievements.ts)
//   circuits  each circuit's hash when last played: records and ghosts on one changed since are forgotten (circuitHash.ts)
// Each value is checked where it's read, so a missing or odd one falls back to its default.
//
// To change the format: bump `version`, and add a migration from the old
// version to the new one to `migrations` (tested in tests/save.test.ts).

import type { SaveFormat } from '../engine/save';
import { parseRecords } from './records';

/** The separate keys of before the save format (version 0); 'controls' was an old one no longer read. */
const LEGACY = ['layout', 'circuit', 'team', 'difficulty', 'weather', 'records', 'vibration', 'stick-side', 'sound', 'controls'];

/** Only the values that are there (JSON keeps no undefined). */
const some = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

export const CC_SAVE: SaveFormat = {
  version: 1,
  legacyKeys: LEGACY,
  migrations: [
    // 0 → 1: the separate keys into one save
    (_, legacy) => {
      const sound = legacy('sound');
      const vibration = legacy('vibration');
      return {
        settings: some({
          sound: sound !== null && Number.isFinite(Number(sound)) ? Number(sound) : undefined,
          vibration: vibration === null ? undefined : vibration !== 'off',
          stickSide: legacy('stick-side'),
          layout: legacy('layout'),
        }),
        choices: some({ circuit: legacy('circuit'), team: legacy('team'), difficulty: legacy('difficulty'), weather: legacy('weather') }),
        records: { circuits: parseRecords(legacy('records')).circuits },
      };
    },
  ],
};
