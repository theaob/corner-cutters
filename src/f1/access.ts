// Accessibility: less motion (the device's ask, or the game's own MOTION setting over it), and two settings of the
// game's own. TEXT: LARGE makes the menus' text and the race's messages (the
// banner, the radio, the pause screen) a fifth bigger (index.html: their sizes
// times --ts). COLOURS: COLOUR-SAFE swaps the colours that tell things apart
// by colour alone (a Time Trial's splits: purple, green and amber, which red-green
// colour blindness runs together) for blue, white and orange, and says which
// is which in words too. Remembered.

import { save, saved } from '../engine/save';
import type { SplitMark } from './timeTrial';

/** MOTION in the settings: follow the phone's reduced-motion setting, or override it either way (the phone's unless set). */
export type MotionSetting = 'auto' | 'reduced' | 'full';
export const MOTION_SETTINGS: MotionSetting[] = ['auto', 'reduced', 'full'];
export function motionSetting(): MotionSetting {
  const v = saved('settings', 'motion');
  return v === 'reduced' || v === 'full' ? v : 'auto';
}
export function setMotionSetting(m: MotionSetting): void {
  save('settings', 'motion', m);
  applyMotion();
}
/** The device asks for less motion (prefers-reduced-motion). */
export function systemMotionReduced(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
/** Less motion wanted: the setting if it's set, else the device's ask. No screen shake unless turned on, a gentler speed zoom, no animations. */
export function motionReduced(): boolean {
  const m = motionSetting();
  return m === 'auto' ? systemMotionReduced() : m === 'reduced';
}
/** Mark the page's root as html.reduce-motion when less motion is wanted (the stylesheet's animations key off it). */
export function applyMotion(root: HTMLElement | undefined = globalThis.document?.documentElement): void {
  root?.classList.toggle('reduce-motion', motionReduced());
  for (const fn of [...motionListeners]) fn();
}
const motionListeners = new Set<() => void>();
/** Run `fn` whenever the MOTION setting (or the device's ask, under PHONE) changes, so what's on screen follows at once. Gives back a stop. */
export function onMotionChange(fn: () => void): () => void {
  motionListeners.add(fn);
  return () => void motionListeners.delete(fn);
}

/** how much bigger LARGE text is */
export const LARGE_TEXT = 1.2;

/** TEXT in the settings: large or not (normal unless set). */
export function largeText(): boolean {
  return saved('settings', 'largeText') === true;
}
export function setLargeText(on: boolean): void {
  save('settings', 'largeText', on);
  applyText();
}
/** Size the page's text as the setting says (on the page's root: html.large-text, --ts). */
export function applyText(root: HTMLElement | undefined = globalThis.document?.documentElement): void {
  if (!root) return;
  const on = largeText();
  root.classList.toggle('large-text', on);
  root.style.setProperty('--ts', on ? String(LARGE_TEXT) : '1');
}

/** COLOURS in the settings: colour-safe or not (standard unless set). */
export function colourSafe(): boolean {
  return saved('settings', 'colourSafe') === true;
}
export function setColourSafe(on: boolean): void {
  save('settings', 'colourSafe', on);
}

/** A split's colour: purple, green, amber; colour-safe, blue, white, orange. */
export function splitColor(mark: SplitMark, safe = colourSafe()): string {
  return (safe ? { record: '#56b4e9', better: '#f4f2fa', worse: '#e69f00' } : { record: '#b36bff', better: '#5fe0d0', worse: '#f2c14e' })[mark];
}
/** What a sector's split says after its time when colour-safe (in words, not colour alone); nothing otherwise. */
export function splitWord(mark: SplitMark, safe = colourSafe()): string {
  return safe ? { record: ' · RECORD', better: ' · BEST', worse: '' }[mark] : '';
}
