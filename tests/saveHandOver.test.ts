import { beforeEach, describe, expect, it, vi } from 'vitest';

const writes: { path: string; data: string; directory: string; encoding: string }[] = [];
let platform = 'android';
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => platform !== 'web', getPlatform: () => platform } }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: async (o: (typeof writes)[number]) => void writes.push(o) },
  Directory: { External: 'EXTERNAL' },
  Encoding: { UTF8: 'utf8' },
}));

import { save, useSave, type SaveStore } from '../src/engine/save';
import { useStore } from '../src/engine/storage';
import { CC_SAVE } from '../src/f1/save';
import { HAND_OVER_FILE, handOverSave } from '../src/engine/saveHandOver';

function memoryStore(): SaveStore {
  const items = new Map<string, string>();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
}

describe('the save handed over to the Unity build', () => {
  beforeEach(() => {
    writes.length = 0;
    platform = 'android';
    useStore('cc:');
    useSave(CC_SAVE, memoryStore());
  });

  it('writes the exported save to cc-save.json in the external files folder, only when it changed', async () => {
    save('settings', 'name', 'ONR');
    expect(await handOverSave()).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ path: HAND_OVER_FILE, directory: 'EXTERNAL', encoding: 'utf8' });
    const doc = JSON.parse(writes[0].data);
    expect(doc.data.settings.name).toBe('ONR');
    expect(doc.data.device).toBeUndefined();
    expect(await handOverSave()).toBe(false);
    save('settings', 'name', 'ABC');
    expect(await handOverSave()).toBe(true);
    expect(writes).toHaveLength(2);
  });
});
