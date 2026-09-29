// What a game keeps on the device (tunings, car edits, the chosen layout)
// lives in local storage under that game's own prefix: itch.io serves every
// HTML game from one origin, so games must not share keys. Each game sets its
// prefix once at boot, before anything reads storage.

let prefix = 'gtm:';

/** Use this game's prefix (e.g. 'gtm:' or 'f1:') for every key from now on. */
export function useStore(gamePrefix: string): void {
  prefix = gamePrefix;
}

/** The storage key for `name` in the current game. */
export function storeKey(name: string): string {
  return prefix + name;
}

/** Grand Theft Monster's saves from before its rename (Critter City). */
export const OLD_STORE = 'critter-city:';

/** Move any saves under the `from` prefix to the current one (a newer save under the current prefix wins). */
export function migrateStore(storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>, from = OLD_STORE): void {
  const old: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(from)) old.push(k);
  }
  for (const k of old) {
    const next = prefix + k.slice(from.length);
    const value = storage.getItem(k);
    if (storage.getItem(next) === null && value !== null) storage.setItem(next, value);
    storage.removeItem(k);
  }
}
