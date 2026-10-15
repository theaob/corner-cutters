import { beforeEach, describe, expect, it } from 'vitest';
import { useSave, type SaveStore } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';
import { driverName, setInitials } from '../src/f1/profile';

describe('your name in a race', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
    useSave(CC_SAVE, store);
  });

  it('is YOU until three letters or digits are picked, then those', () => {
    expect(driverName()).toBe('YOU');
    setInitials('ab');
    expect(driverName()).toBe('YOU');
    setInitials('ONR');
    expect(driverName()).toBe('ONR');
  });
});
