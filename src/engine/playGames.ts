// The bridge to Google Play Games (the Android app's own plugin, PlayGamesPlugin.java), and whether this build
// talks to it at all: only the Google Play build (VITE_STORE=play), run as the app.

import { Capacitor, registerPlugin } from '@capacitor/core';

/** What the app's bridge to Play Games does (the native plugin, PlayGamesPlugin.java). */
export interface PlayGamesBridge {
  start(): Promise<{ available: boolean; signedIn: boolean }>;
  signIn(): Promise<{ available: boolean; signedIn: boolean }>;
  unlock(o: { id: string }): Promise<void>;
  showAchievements(): Promise<void>;
}

/** Whether this build has Google Play Games: the Google Play build, as the Android app. */
export const playGamesBuild = (): boolean => import.meta.env.VITE_STORE === 'play' && Capacitor.isNativePlatform();

export const PlayGames = registerPlugin<PlayGamesBridge>('PlayGames');
