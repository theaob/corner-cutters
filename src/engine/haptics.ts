// Vibration: in the Android app through Capacitor's Haptics plugin, in a
// browser through the Vibration API (Android browsers; iOS Safari has none, so
// there it's silent). The player can turn it off; the choice is kept on the device.

import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { storeKey } from './storage';

let enabled: boolean | undefined;
const KEY = () => storeKey('vibration');

/** Whether vibration is on (it is unless the player turned it off). */
export function vibrationOn(): boolean {
  if (enabled === undefined) {
    try {
      enabled = localStorage.getItem(KEY()) !== 'off';
    } catch {
      enabled = true;
    }
  }
  return enabled;
}

/** Turn vibration on or off, and remember it. */
export function setVibration(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY(), on ? 'on' : 'off');
  } catch {
    // storage blocked: the choice lasts until the page closes
  }
}

/** Vibrate for `ms` milliseconds, if vibration is on and the device can. */
export function vibrate(ms: number): void {
  if (ms <= 0 || !vibrationOn()) return;
  const duration = Math.round(ms);
  try {
    if (Capacitor.isNativePlatform()) void Haptics.vibrate({ duration }).catch(() => {});
    else navigator.vibrate?.(duration);
  } catch {
    // not allowed here (some frames, before the first touch): no buzz
  }
}
