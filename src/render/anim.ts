// Animation scheduler for the board: tweens with easing, a speed multiplier, a clamped clock,
// and skip-to-end. Every promise it hands out ALWAYS resolves (on completion, skip, or dispose).

export type Easing = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  outBack:
    (s = 1.70158) =>
    (t: number) => {
      const c3 = s + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
    },
  inBack:
    (s = 1.70158) =>
    (t: number) =>
      (s + 1) * t * t * t - s * t * t,
};

/** A playback "run" (one playEvent). Once skipped, every later tween/wait in it completes at once. */
export class Run {
  skipped = false;
}

interface Tween {
  dur: number;
  t: number;
  ease: Easing;
  update: (v: number, raw: number) => void;
  done?: () => void;
  resolve: () => void;
  run: Run | null;
  finished: boolean;
}

export interface TweenOpts {
  /** Duration at 1x, ms. Scaled by the animator speed unless `unscaled`. */
  ms: number;
  ease?: Easing;
  update?: (v: number, raw: number) => void;
  done?: () => void;
  run?: Run | null;
  unscaled?: boolean;
  /** Delay before the tween starts (scaled like ms). */
  delay?: number;
}

export class Animator {
  speed = 1;
  private tweens: Tween[] = [];
  private runs = new Set<Run>();
  /** Animator time, ms (advances with the clamped delta). */
  now = 0;

  /** Board duration at the current speed: 2x halves (floor 80 ms), 0 = instant. */
  scale(ms: number): number {
    if (this.speed <= 0) return 0;
    if (this.speed === 1) return ms;
    return Math.max(Math.min(ms, 80), ms / this.speed);
  }

  get instant(): boolean {
    return this.speed <= 0;
  }

  beginRun(): Run {
    const r = new Run();
    if (this.speed <= 0) r.skipped = true;
    this.runs.add(r);
    return r;
  }

  endRun(r: Run): void {
    this.runs.delete(r);
  }

  tween(o: TweenOpts): Promise<void> {
    const run = o.run ?? null;
    const dur = o.unscaled ? o.ms : this.scale(o.ms);
    const delay = o.delay ? (o.unscaled ? o.delay : this.scale(o.delay)) : 0;
    const easeFn = o.ease ?? ease.outCubic;
    const update = o.update ?? (() => {});
    if ((run && run.skipped) || (dur <= 0 && delay <= 0)) {
      try {
        update(1, 1);
        o.done?.();
      } catch (e) {
        console.warn('[render] tween', e);
      }
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const tw: Tween = {
        dur: Math.max(1, dur),
        t: -delay,
        ease: easeFn,
        update,
        done: o.done,
        resolve,
        run,
        finished: false,
      };
      this.tweens.push(tw);
      if (delay <= 0) {
        try {
          update(0, 0);
        } catch (e) {
          console.warn('[render] tween', e);
        }
      }
    });
  }

  /** Wait on the animator clock (scaled; skipped runs return at once). */
  wait(ms: number, run?: Run | null, unscaled = false): Promise<void> {
    return this.tween({ ms, run, unscaled, ease: ease.linear });
  }

  get active(): number {
    return this.tweens.length;
  }

  tick(dtMs: number): void {
    const dt = Math.min(Math.max(dtMs, 0), 50);
    this.now += dt;
    if (!this.tweens.length) return;
    const list = this.tweens;
    this.tweens = [];
    const keep: Tween[] = [];
    for (const tw of list) {
      if (tw.finished) continue;
      const wasNeg = tw.t < 0;
      tw.t += dt;
      if (tw.t < 0) {
        keep.push(tw);
        continue;
      }
      const raw = Math.min(1, tw.t / tw.dur);
      try {
        if (wasNeg && raw < 1) tw.update(tw.ease(0), 0);
        tw.update(tw.ease(raw), raw);
      } catch (e) {
        console.warn('[render] tween', e);
      }
      if (raw >= 1) this.finish(tw, false);
      else keep.push(tw);
    }
    // Tweens created during updates were pushed to this.tweens.
    this.tweens = keep.concat(this.tweens);
  }

  private finish(tw: Tween, snap: boolean): void {
    if (tw.finished) return;
    tw.finished = true;
    try {
      if (snap) tw.update(tw.ease(1), 1);
      tw.done?.();
    } catch (e) {
      console.warn('[render] tween', e);
    }
    tw.resolve();
  }

  /** Complete every running tween and flag every open run as skipped. */
  skipAll(): void {
    for (const r of this.runs) r.skipped = true;
    // Completing a tween can spawn new ones (sequences); loop until quiet.
    for (let guard = 0; guard < 20 && this.tweens.length; guard++) {
      const list = this.tweens;
      this.tweens = [];
      for (const tw of list) this.finish(tw, true);
    }
  }

  /** Skip only the tweens belonging to one run. */
  skipRun(r: Run): void {
    r.skipped = true;
    const mine = this.tweens.filter((t) => t.run === r);
    this.tweens = this.tweens.filter((t) => t.run !== r);
    for (const tw of mine) this.finish(tw, true);
  }

  dispose(): void {
    this.skipAll();
    this.runs.clear();
  }
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// --- v4 one motion ladder (_claude/v4/PLAN.md §5b E5) ------------------------------------------------------
/** The tier bands at 1×, ms: 0 tick · 1 stroke · 2 soak · 3 breath. */
export const TIER_BANDS: Readonly<Record<0 | 1 | 2 | 3, readonly [number, number]>> = {
  0: [160, 290],
  1: [400, 650],
  2: [650, 1200],
  3: [1600, 2400],
};
/** A motion's duration kept inside its tier's band (absent tier: the event's own v3 number, unchanged). */
export function tierMs(ms: number, tier?: 0 | 1 | 2 | 3): number {
  if (tier === undefined) return ms;
  const [a, b] = TIER_BANDS[tier];
  return clamp(ms, a, b);
}
/**
 * The readable beat (v4 §8a Q7, PlayEventOptions.style 'readable'): one AI engagement, ≈ 900 ms at 1×.
 * The stroke draws (STROKE), the casualties tick on the loser's stone (TICKS, shared by every roll of the
 * engagement, so a long blitz folds into the same beat), then the verdict: the flood with the march
 * (CONQUER_WAIT + MARCH) or, if the attack stops, the attacker's recoil (RECOIL).
 */
export const READABLE = { STROKE: 300, TICKS: 160, CONQUER_WAIT: 100, MARCH: 340, FLOOD: 650, RECOIL: 300 } as const;

// --- v6 one fight timing table (_claude/v6/audit/feel.md rows 10–16) ----------------------------------------
/**
 * Every fight number at 1×, read by the renderer (dice.ts, index.ts) AND the controller's timing model
 * (src/game/timingModel.ts), so the stub board and the real board can't drift apart again (v5 had the blitz cap
 * at 3000 in one and 2800 in the other).
 *
 * A full roll (single / repeat / a blitz's final): the pour, the last die hangs a breath (HANG) while the room
 * hushes (HUSH_LEAD before it lands), it lands, and the verdict follows at once: pair 0's gold hairline draws
 * (HAIR) and lands ≤ 150 ms after the dice settle; pair 1 lands PAIR_GAP later (140–180: two beats, not one).
 * A decisive roll (it captures) draws its final hairline slower (HAIR_DECISIVE); the hit-stop that follows
 * belongs to the conquest, not to the roll (so the roll budget never pays for it).
 */
export const FIGHT = {
  SHAKE: 120,
  TUMBLE: 450,
  /** The last die's extra hang in the air: the anticipation (the old 250 ms silence after the dice moved). */
  HANG: 80,
  SETTLE: 100,
  /** The landing squash inside SETTLE (the last die touches down SQUASH before the pour window ends). */
  SQUASH: 90,
  /** The hush starts this long before the last die lands and ends just before its click. */
  HUSH_LEAD: 90,
  /** The verdict's first hairline starts this long after the last die's click (inside its squash). */
  VERDICT_LEAD: 30,
  HAIR: 120,
  HAIR_DECISIVE: 200,
  PAIR_GAP: 160,
  /** After the last pair lands: the losers finish dimming (routine), or the hit-stop takes over (decisive). */
  TAIL: 60,
  TAIL_DECISIVE: 40,
  /** A blitz's first roll (shake 80, tumble 320, settle 60, every pair at once 200). */
  BLITZ_FIRST: 660,
  /** A blitz's final roll: the dice already in the tray hop hard onto their last faces, then the full verdict. */
  BLITZ_FINAL_HOP: 300,
  /** Middle rolls: a beat never shorter than this; a long blitz batches rolls per beat so the cap holds. */
  MID_MIN: 90,
  /** Dispatch + a frame or two per middle roll (beat or batched), measured. */
  MID_OVERHEAD: 15,
  /** The blitz's planned length (the metric's budget is 3.0 s; the live clamp below aims at BLITZ_BUDGET). */
  BLITZ_CAP: 2800,
  BLITZ_BUDGET: 2850,
  /** The conquest's hit-stop (decisive rolls only, human dice shows only): a held frame, the score ducked. */
  HIT_STOP: 100,
  /** The camera's push toward the impact on a decisive roll, as a fraction of the camera distance. */
  PUSH: 0.025,
} as const;

/**
 * A full roll from the shake to the verdict's first hairline: the pour window (shake + tumble + hang + settle) less
 * the part of the last die's squash the verdict overlaps (it starts VERDICT_LEAD after the last click).
 */
export function pourMs(shake: number): number {
  return shake + FIGHT.TUMBLE + FIGHT.HANG + FIGHT.SETTLE - (FIGHT.SQUASH - FIGHT.VERDICT_LEAD);
}
/** A full roll's verdict at 1×: pairs (1–2), decisive or not. */
export function verdictMs(pairs: number, decisive = false): number {
  const n = Math.max(1, pairs);
  // (a one-pair roll's verdict is its first too: it keeps the quick hairline, the hit-stop marks it)
  const lastHair = decisive && n > 1 ? FIGHT.HAIR_DECISIVE : FIGHT.HAIR;
  return (n - 1) * FIGHT.PAIR_GAP + lastHair + (decisive ? FIGHT.TAIL_DECISIVE : FIGHT.TAIL);
}
/** The blitz's final roll at 1× (2 pairs, decisive: the longest case). */
export const BLITZ_FINAL_MS = FIGHT.BLITZ_FINAL_HOP + FIGHT.HANG - (FIGHT.SQUASH - FIGHT.VERDICT_LEAD) + verdictMs(2, true);
/** A single full roll at 1×, the longest case (shake + pour + a decisive two-pair verdict) plus ~40 ms of frames. */
export const SINGLE_ROLL_MS = pourMs(FIGHT.SHAKE) + verdictMs(2, true) + 40;

/**
 * A blitz's middle rolls (count − 2 of them) as beats: a long blitz batches `batch` rolls into one beat so no
 * beat is shorter than MID_MIN and the whole blitz holds BLITZ_CAP. Roll `index` (1 … count − 2) is a beat when
 * it closes its batch (or is the last middle); every other middle roll is folded (0 ms: its losses land on the
 * next beat's frame).
 */
export function blitzBeats(count: number): { mids: number; batch: number; beats: number; room: number } {
  const mids = Math.max(0, count - 2);
  const room = Math.max(0, FIGHT.BLITZ_CAP - FIGHT.BLITZ_FIRST - BLITZ_FINAL_MS - mids * FIGHT.MID_OVERHEAD);
  if (!mids) return { mids, batch: 1, beats: 0, room };
  const maxBeats = Math.max(1, Math.floor(room / FIGHT.MID_MIN));
  const batch = Math.max(1, Math.ceil(mids / maxBeats));
  return { mids, batch, beats: Math.ceil(mids / batch), room };
}
/** Is middle roll `index` a beat (true) or folded into the next beat (false)? */
export function isBlitzBeat(index: number, count: number): boolean {
  if (index <= 0 || index >= count - 1) return true;
  const { batch } = blitzBeats(count);
  return batch <= 1 || index === count - 2 || (index - 1) % batch === batch - 1;
}
/**
 * Blitz roll durations at 1×: the first roll full, the final the hop + verdict, the middles as beats that start
 * slow and quicken (max(180, 600 × 0.75^(j−1)) for beat j), scaled into the room left under the cap, floor
 * MID_MIN; folded middles are 0. A single roll (count ≤ 1) is SINGLE_ROLL_MS.
 */
export function blitzRollMs(index: number, count: number): number {
  if (count <= 1) return SINGLE_ROLL_MS;
  if (index === 0) return FIGHT.BLITZ_FIRST;
  if (index === count - 1) return BLITZ_FINAL_MS;
  if (!isBlitzBeat(index, count)) return 0;
  const { batch, beats, room } = blitzBeats(count);
  const plan = (j: number) => Math.max(180, 600 * Math.pow(0.75, j - 1));
  let total = 0;
  for (let j = 1; j <= beats; j++) total += plan(j);
  const j = Math.min(beats, Math.floor((index - 1) / batch) + 1);
  if (total <= room) return plan(j);
  // scale the plan down until the floored beats fill exactly the room (the floor never pushes past the cap)
  const floor = Math.min(FIGHT.MID_MIN, room / Math.max(1, beats));
  const sum = (s: number) => {
    let a = 0;
    for (let k = 1; k <= beats; k++) a += Math.max(floor, plan(k) * s);
    return a;
  };
  let lo = 0;
  let hi = 1;
  for (let it = 0; it < 30; it++) {
    const mid = (lo + hi) / 2;
    if (sum(mid) > room) hi = mid;
    else lo = mid;
  }
  return Math.max(floor, plan(j) * lo);
}
