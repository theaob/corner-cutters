// The save left for the next version of the Android app (the Unity build, unity/README.md "Saves"): in the Android
// app only, the whole save (as EXPORT SAVE makes it) is written to cc-save.json in the app's own external files
// folder, which an update keeps and which is where the Unity build looks, once, when it first starts with no save
// of its own. Written as the game starts and each time it goes to the background, and only when it has changed.

import { Capacitor } from '@capacitor/core';
import { exportSaveDoc, flushSave } from './save';

export const HAND_OVER_FILE = 'cc-save.json';

let last = '';

/** Write the save out now if it changed since it last was (true if written). */
export async function handOverSave(): Promise<boolean> {
  flushSave();
  const json = JSON.stringify(exportSaveDoc());
  if (json === last) return false;
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({ path: HAND_OVER_FILE, data: json, directory: Directory.External, encoding: Encoding.UTF8 });
    last = json;
    return true;
  } catch {
    // (no room, or no external folder: the next time it goes to the background tries again)
    return false;
  }
}

/** In the Android app: hand the save over now and whenever the game goes to the background. */
export function startSaveHandOver(): void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  void handOverSave();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void handOverSave();
  });
}
