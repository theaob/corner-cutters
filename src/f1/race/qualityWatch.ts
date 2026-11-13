// The race's watch on the picture's quality: the governor steps the level down
// (and back up) as the frames run slow or fast; GRAPHICS: HIGH and LOW hold a
// level instead; the level where the race settled is kept on the device, so the
// next race doesn't start over (engine/render/quality.ts).

import { setQuality } from '../../engine/logbook';
import { DEFAULT_GOVERNOR, QUALITY_LEVELS, QualityGovernor, keptQuality } from '../../engine/render/quality';
import { save as saveValue, saved as savedValue } from '../../engine/save';
import { graphicsSetting, heldLevel } from '../graphics';

export class QualityWatch {
  readonly governor: QualityGovernor;
  /** frames to leave out of the quality governor after a pause (the first frame back measures the pause) */
  settle = 0;
  /** the level set by hand (__cc.quality): not kept */
  held = false;
  /** the level kept last, and whether it was locked (a change from it is kept again) */
  private kept: { level: number; locked: boolean };
  /** GRAPHICS held the level this frame (not AUTO) */
  private wasHeld = false;

  /** (the picture's quality where the last race settled, so this one doesn't step down again mid-race) */
  constructor(private readonly gameVersion: string) {
    this.governor = new QualityGovernor(DEFAULT_GOVERNOR, keptQuality(savedValue('device', 'quality'), Date.now(), gameVersion));
    this.kept = { level: this.governor.level, locked: this.governor.locked };
  }

  /** A level set by hand (a debug hook): locked, and not kept. */
  set(level: number): void {
    this.governor.level = level;
    this.governor.locked = true;
    this.held = true;
  }

  /** One frame's watch, `real` seconds long; the level now. */
  step(real: number): number {
    const { governor } = this;
    // (GRAPHICS: HIGH and LOW hold their level, whatever the frame rate: the governor's watch is over and nothing is kept)
    const held = heldLevel(graphicsSetting());
    if (held !== undefined) {
      governor.level = held;
      governor.locked = true;
    } else if (this.wasHeld && !this.held) {
      // (back to AUTO: the governor watches again, from full quality)
      governor.level = 0;
      governor.locked = false;
    }
    this.wasHeld = held !== undefined;
    if (held !== undefined) {
      // nothing to sample
    } else if (this.settle > 0) this.settle--;
    // (the frame's real length, not the simulation's capped one: at 5 fps the capped time ran the governor's waits four times too long, a step down every 20 s)
    else governor.sample(Math.min(real, 0.25));
    if (!this.held && !this.wasHeld && (governor.level !== this.kept.level || governor.locked !== this.kept.locked)) {
      this.kept = { level: governor.level, locked: governor.locked };
      saveValue('device', 'quality', { ...this.kept, at: Date.now(), version: this.gameVersion });
    }
    setQuality(QUALITY_LEVELS[governor.level].name);
    return governor.level;
  }
}
