// Quality levels for the HD-2D renderer, and the governor that steps down
// when a phone can't keep up. It never steps back up on its own, so the
// picture doesn't flicker between levels.

export interface QualityLevel {
  name: string;
  /** render resolution in multiples of game pixels */
  res: number;
  bloom: boolean;
  blur: boolean;
  shadowMap: number;
}

export const QUALITY_LEVELS: QualityLevel[] = [
  { name: 'high', res: 2, bloom: true, blur: true, shadowMap: 2048 },
  { name: 'medium', res: 2, bloom: false, blur: true, shadowMap: 1024 },
  { name: 'low', res: 1, bloom: false, blur: false, shadowMap: 1024 },
];

export interface GovernorParams {
  /** frame time (ms) above which we consider the phone too slow (20 ms ≈ 50 fps) */
  slowMs: number;
  /** seconds of sustained slowness before stepping down */
  patience: number;
  /** seconds to ignore after start or a level change (shader compiles, loading) */
  warmup: number;
}

export const DEFAULT_GOVERNOR: GovernorParams = { slowMs: 20, patience: 1.5, warmup: 1.0 };

export class QualityGovernor {
  level = 0;
  private avgMs = 16.7;
  private slowFor = 0;
  private sinceChange = 0;

  constructor(private readonly p: GovernorParams = DEFAULT_GOVERNOR) {}

  /** Feed one frame's duration (seconds); returns the level to use. */
  sample(dt: number): number {
    this.sinceChange += dt;
    if (this.sinceChange < this.p.warmup) return this.level;
    this.avgMs += (dt * 1000 - this.avgMs) * 0.1;
    this.slowFor = this.avgMs > this.p.slowMs ? this.slowFor + dt : 0;
    if (this.slowFor >= this.p.patience && this.level < QUALITY_LEVELS.length - 1) {
      this.level++;
      this.slowFor = 0;
      this.sinceChange = 0;
      this.avgMs = 16.7;
    }
    return this.level;
  }
}
