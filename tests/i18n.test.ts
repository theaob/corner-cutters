import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSave, type SaveStore } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';
import { LANGUAGES } from '../src/f1/lang';
import { ENGLISH, applyLanguage, availableLanguages, language, setLanguage, t, useLanguages, type Language } from '../src/engine/i18n';

const xx: Language = { code: 'xx', name: 'Xxish', words: { SETTINGS: 'XSET', 'lap {n} of {total}': 'x{total}/{n}' } };

describe('language', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
    useSave(CC_SAVE, store);
    vi.stubGlobal('navigator', { languages: ['en-GB'] });
    useLanguages([xx]);
  });

  it('English is first and the default; text reads as written', () => {
    expect(availableLanguages()[0]).toBe(ENGLISH);
    expect(language().code).toBe('en');
    expect(t('SETTINGS')).toBe('SETTINGS');
  });

  it("follows the device's language when the game has it, else English", () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR', 'xx-YY'] });
    useLanguages([xx]);
    expect(language().code).toBe('xx');
    vi.stubGlobal('navigator', { languages: ['fr-FR'] });
    useLanguages([xx]);
    expect(language().code).toBe('en');
  });

  it('a saved choice wins over the device, and is remembered', () => {
    setLanguage('xx');
    expect(t('SETTINGS')).toBe('XSET');
    vi.stubGlobal('navigator', { languages: ['en'] });
    applyLanguage();
    expect(language().code).toBe('xx');
    setLanguage('en');
    applyLanguage();
    expect(t('SETTINGS')).toBe('SETTINGS');
  });

  it('untranslated text falls back to English; {name}s are filled', () => {
    setLanguage('xx');
    expect(t('SHOP')).toBe('SHOP');
    expect(t('lap {n} of {total}', { n: 2, total: 5 })).toBe('x5/2');
    expect(t('{a} stays', {})).toBe('{a} stays');
  });

  it('ignores a language the game does not have', () => {
    setLanguage('zz');
    expect(language().code).toBe('en');
  });
});

describe("the game's languages", () => {
  it('keep the {names}, and short labels fit a narrow phone', () => {
    for (const l of LANGUAGES) {
      for (const [en, tr] of Object.entries(l.words)) {
        const names = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join();
        expect(names(tr), `${l.code}: ${en}`).toBe(names(en));
        if (en.length <= 14 && en === en.toUpperCase()) expect(tr.length, `${l.code}: ${en} → ${tr}`).toBeLessThanOrEqual(Math.ceil(en.length * 1.5) + 2);
      }
    }
  });
});

describe('a language change keeps the settings open', () => {
  it('notes the settings were open across the reload, once', async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
    const { markSettingsResume, settingsResumePending, takeSettingsResume } = await import('../src/engine/i18n');
    expect(settingsResumePending()).toBe(false);
    markSettingsResume();
    expect(settingsResumePending()).toBe(true);
    expect(takeSettingsResume()).toBe(true);
    expect(takeSettingsResume()).toBe(false);
  });

  it('works without storage', async () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => {} });
    const { markSettingsResume, takeSettingsResume } = await import('../src/engine/i18n');
    expect(() => markSettingsResume()).not.toThrow();
    expect(takeSettingsResume()).toBe(false);
  });
});
