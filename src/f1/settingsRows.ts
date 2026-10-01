// The settings rows shared by the menu's SETTINGS screen and the pause screen:
// which side the thumbstick sits on, vibration, screen shake, and the sound and
// music volumes, each changed with left/right (or a tap or swipe) and remembered
// as it changes. Difficulty is the menu's alone (not changed mid-race).

import { setStickSide, stickSide, type StickSide } from '../engine/deck';
import { setVibration, vibrate, vibrationOn } from '../engine/haptics';
import { VOLUMES, setSoundVolume, soundVolume } from '../engine/audio';
import { musicVolume, setMusicVolume } from '../engine/music';
import { optionRow } from './circuitSelect';
import { setShake, shakeOn } from './shake';

/** The nearest volume step to `v`. */
const nearest = (v: number) => VOLUMES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
const volumeName = (v: number) => ['OFF', 'LOW', 'MEDIUM', 'HIGH'][VOLUMES.indexOf(v as (typeof VOLUMES)[number])];

export type SettingsRow = ReturnType<typeof optionRow<unknown>>;

/** The rows, read from the save as they are now. */
export function settingsRows(): SettingsRow[] {
  const deck = document.getElementById('deck');
  const sides: StickSide[] = ['left', 'right'];
  const stickRow = optionRow('STICK', sides, stickSide(), (side) => ({ name: side.toUpperCase(), about: side === 'left' ? 'thumbstick left · A and B right' : 'thumbstick right · A and B left' }), (side) => {
    if (deck) setStickSide(deck, side);
  });
  const vibrationRow = optionRow('VIBRATION', [true, false], vibrationOn(), (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'crashes, grass, kerbs' : 'no buzzing' }), (on) => {
    setVibration(on);
    vibrate(40);
  });
  const soundRow = optionRow('SOUND', [...VOLUMES], nearest(soundVolume()), (v) => ({ name: volumeName(v), about: v ? 'engines, tyres, crashes, lights' : 'silence' }), setSoundVolume);
  const musicRow = optionRow('MUSIC', [...VOLUMES], nearest(musicVolume()), (v) => ({ name: volumeName(v), about: v ? 'menu and race tracks' : 'silence' }), setMusicVolume);
  const shakeRow = optionRow('SCREEN SHAKE', [true, false], shakeOn(), (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'crashes, kerbs and grass shake the camera' : 'the camera stays still' }), setShake);
  return [stickRow, vibrationRow, shakeRow, soundRow, musicRow] as SettingsRow[];
}
