import { describe, expect, it } from 'vitest';
import { migrateStore, storeKey, useStore } from '../src/engine/storage';

useStore('gtm:');
const STORE = storeKey('');

const memory = (init: Record<string, string>) => {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
};

describe('migrateStore', () => {
  it('moves saves from the old name to the new prefix', () => {
    const s = memory({ 'critter-city:tune:game': '{"walk":80}', 'critter-city:vehicles': '[1]', other: 'x' });
    migrateStore(s);
    expect(s.dump()).toEqual({ [`${STORE}tune:game`]: '{"walk":80}', [`${STORE}vehicles`]: '[1]', other: 'x' });
  });

  it('keeps a newer save already under the new prefix', () => {
    const s = memory({ 'critter-city:look': 'C', [`${STORE}look`]: 'D' });
    migrateStore(s);
    expect(s.dump()).toEqual({ [`${STORE}look`]: 'D' });
  });

  it('does nothing when there is nothing old', () => {
    const s = memory({ [`${STORE}look`]: 'E' });
    migrateStore(s);
    expect(s.dump()).toEqual({ [`${STORE}look`]: 'E' });
  });
});

describe('game prefixes', () => {
  it('keeps each game to its own keys', () => {
    useStore('f1:');
    expect(storeKey('vehicles')).toBe('f1:vehicles');
    useStore('gtm:');
    expect(storeKey('vehicles')).toBe('gtm:vehicles');
  });
});
