import seedrandom from "seedrandom";

/** Deterministic random helpers. Every generator run with the same seed yields the same warehouse. */
export class Rng {
  private r: seedrandom.PRNG;
  constructor(seed: string) { this.r = seedrandom(seed); }
  float(): number { return this.r(); }
  int(min: number, max: number): number { return min + Math.floor(this.r() * (max - min + 1)); }
  chance(p: number): boolean { return this.r() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.r() * arr.length)]; }
  /** Standard normal via Box-Muller. */
  normal(mean = 0, sd = 1): number {
    let u = 0, v = 0;
    while (u === 0) u = this.r();
    while (v === 0) v = this.r();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  weighted<T>(items: readonly [T, number][]): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let x = this.r() * total;
    for (const [item, w] of items) { x -= w; if (x <= 0) return item; }
    return items[items.length - 1][0];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
}

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
/** Logistic squash of a latent z-score into a probability around a base rate. */
export const logit = (p: number) => Math.log(p / (1 - p));
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const probFromLatent = (base: number, z: number, slope = 1) => sigmoid(logit(clamp(base, 0.001, 0.999)) + slope * z);
