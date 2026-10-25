// Language support: the game's text is written in English, and `t('SETTINGS')` gives that text in the chosen
// language (the English itself is the key, so a string without a translation, or in English, reads as written).
// A language is a dictionary from English text to its translation; `{name}` in the text is filled from `vars`.
// The choice is remembered (settings.language); until one is made it follows the device's language where the
// game has it, else English. Menus are built once, so a change takes a page reload (the app does that).

import { save, saved } from './save';

export interface Language {
  /** BCP 47 base code, e.g. 'es' */
  code: string;
  /** its own name, as its speakers write it (shown in the LANGUAGE row) */
  name: string;
  /** English text to translation */
  words: Record<string, string>;
}

export const ENGLISH: Language = { code: 'en', name: 'English', words: {} };

let languages: Language[] = [ENGLISH];
let current: Language = ENGLISH;

/** The languages the game has, English first. Called once at boot (src/f1/lang). */
export function useLanguages(list: Language[]): void {
  languages = [ENGLISH, ...list.filter((l) => l.code !== ENGLISH.code)];
  current = pick();
}
export const availableLanguages = (): Language[] => languages;

/** The device's languages as base codes, most preferred first. */
function deviceCodes(): string[] {
  const nav = globalThis.navigator;
  const list = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  return list.map((l) => l.toLowerCase().split('-')[0]);
}

/** The saved choice if it's a language we have, else the first of the device's we have, else English. */
function pick(): Language {
  const code = saved('settings', 'language');
  const have = (c: unknown) => languages.find((l) => l.code === c);
  return have(code) ?? deviceCodes().map(have).find(Boolean) ?? ENGLISH;
}

export const language = (): Language => current;

/** LANGUAGE in the settings: remembered. */
export function setLanguage(code: string): void {
  const l = languages.find((x) => x.code === code);
  if (!l) return;
  save('settings', 'language', l.code);
  current = l;
  globalThis.document?.documentElement.setAttribute('lang', l.code);
  for (const fn of [...listeners]) fn();
}
const listeners = new Set<() => void>();
/** Run `fn` when the language changes. Gives back a stop. */
export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Mark the page's language (for screen readers and the browser) as chosen. */
export function applyLanguage(): void {
  current = pick();
  globalThis.document?.documentElement.setAttribute('lang', current.code);
}

/** The text in the chosen language; `{name}`s in it filled from `vars`. */
export function t(english: string, vars?: Record<string, string | number>): string {
  const text = current.words[english] ?? english;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** The back button's label: the arrow is the button's, the word is translated. */
export const backLabel = (): string => `◀ ${t('BACK')}`;

/** Capitals / lower case by the chosen language's rules (Turkish: i ↔ İ, ı ↔ I). */
export const upper = (text: string): string => text.toLocaleUpperCase(current.code);
export const lower = (text: string): string => text.toLocaleLowerCase(current.code);
