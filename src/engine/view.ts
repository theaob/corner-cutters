// How the game plugs into the page: the page sizes the screen, then
// mounts the view on it with the shared services; the view re-fits on resize.

import type { Services } from './services';
import type { ScreenFit } from './layout';
import type { ParamSpec, Values } from './tuning';

/** What a mounted view exposes back to the page. */
export interface StandaloneView {
  resize(fit: ScreenFit): void;
}
export type MountStandalone = (args: {
  host: HTMLElement;
  services: Services;
  /** live TUNE values; undefined when a game runs without the TUNE panel (its defaults) */
  tuning?: Values<ParamSpec>;
  fit: ScreenFit;
}) => Promise<StandaloneView>;
