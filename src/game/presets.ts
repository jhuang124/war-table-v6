// New game screen (UX.md §4.1): the draft the menu edits, its GameConfig mapping, the length/setup
// presets with honest time estimates, the summary line, and the problems that block Start.

import { PLAYER_COLORS, PLAYER_COLOR_IDS, DEFAULT_SEAT_COLORS } from '../shared/palette';
import {
  isPersonality,
  mapDefOf,
  minStartingArmies,
  PERSONALITY_IDS,
  targetTerritories,
  type AiDifficulty,
  type AiPersonality,
  type CapitalsRule,
  type GameConfig,
  type PlayerColorId,
} from '../engine';
import { DEFAULT_MAP_ID, isHiddenMap, mapIdOf, packData } from '../map/packs';
import { SEP } from './copy';
import type { HouseRulesDraft, LengthPreset, NewGameVM, SeatDraft, SetupPreset } from './viewModel';

/** The neutral seat applies only to exactly 2 seats (engine ignores it otherwise). */
export function usesNeutral(d: NewGameDraft): boolean {
  return d.seats.length === 2 && d.house.neutral === true;
}

/**
 * v6 "difficulty as an honest dial": what each level means. Easy and Normal play the difficulty's AI as is; Hard
 * plays the Hard AI and gets extra armies at the start of each of its turns (PlayerConfig.handicap). Measured
 * (scripts/v6/exp-difficulty.ts: one AI at the level among three Normal AIs, personalities at random, Evening 70%,
 * n=1000 each; fair share 25%): Easy 6.2% · Normal 27.7% · Hard as the AI alone 34.7% · Hard +1 43.9% ·
 * Hard +2 55.1%. Hard is +1 (target 40–50%).
 */
export const DIFFICULTY_HANDICAP: Record<AiDifficulty, number> = { easy: 0, normal: 0, hard: 1 };

/** Plain words for the seat picker: the level and what it means, one line each. */
export const DIFFICULTY_LABELS: Record<AiDifficulty, string> = {
  easy: 'Easy · plays loose',
  normal: 'Normal',
  hard: 'Hard · +1 army a turn',
};

/**
 * v6 lengths: Full conquest is an advanced option (the UI lists it under More). Quick and Evening are the two
 * headline lengths.
 */
export const ADVANCED_LENGTHS: readonly LengthPreset[] = ['full'];
export function isAdvancedLength(id: LengthPreset): boolean {
  return ADVANCED_LENGTHS.includes(id);
}

/**
 * v6 capitals (config.capitals): each seat's capital pays its holder +1 army a turn. On by default at 3–4 seats,
 * where it passed every gate against the same build without it (scripts/v6/exp-capitals.ts, n=800 per row:
 * median rounds 10→10 / 13→13, first mover 32.5→33.5% / 20.6→19.5%, round-5 leader wins 57.9→54.5% /
 * 39.9→41.3%, none over before round 4). Off at 2 seats: the first mover went 47.6→55.1% (fails ±3). +2 and
 * "holding every capital wins" failed (docs/SPEC.md §11.9).
 */
export const CAPITALS_RULE: CapitalsRule = { bonus: 1 };
export const CAPITALS_ON_BY_SEATS: Record<number, boolean> = { 2: false, 3: true, 4: true };

export interface NewGameDraft {
  seats: SeatDraft[];
  length: LengthPreset;
  setup: SetupPreset;
  house: HouseRulesDraft;
  /** v3: the map pack (docs/MAPS.md); absent = classic. */
  mapId?: string;
  /**
   * v5.1 D: the draft was written by a v5.1+ build (personalities absent = random, house rules off by default).
   * A remembered draft without it keeps its table (seats, length, map) and drops the old auto-filled
   * personalities and house-rule defaults.
   */
  v51?: true;
}

/**
 * v5.1 D: a seat keeps a personality only when one was chosen (under "More"); absent = random at Start
 * (`draftToConfig` draws it from the seed). Invalid values are dropped.
 */
export function fillPersonalities(seats: SeatDraft[]): SeatDraft[] {
  return seats.map((s) => {
    const { personality, ...rest } = s;
    return isPersonality(personality) ? { ...rest, personality } : rest;
  }) as SeatDraft[];
}

/** A small seeded generator (mulberry32) for the Start-time draws; never Math.random. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * v5.1 D "just randomize": every AI seat without a chosen personality gets one at random from the seed
 * (Turtle · Opportunist · Warlord). A table of up to three random AIs is dealt without repeats when it can be,
 * so a fresh table still meets different opponents; with more AIs than personalities the rest repeat at random.
 */
export function randomPersonalities(seats: SeatDraft[], seed: number): (AiPersonality | undefined)[] {
  const rnd = seeded(seed ^ 0x51a7e);
  const bag: AiPersonality[] = [];
  const draw = (): AiPersonality => {
    if (!bag.length) {
      const fresh = [...PERSONALITY_IDS];
      for (let i = fresh.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
      }
      bag.push(...fresh);
    }
    return bag.shift()!;
  };
  return seats.map((s) => (s.kind !== 'ai' ? undefined : isPersonality(s.personality) ? s.personality : draw()));
}

/** v5 G Missions apply: a third seat at the table (3–4 players, or 2 with the neutral seat). */
export function missionsApply(d: NewGameDraft): boolean {
  return d.seats.length >= 3 || usesNeutral(d);
}

/**
 * v3 Truces apply (v5.1: standing): at least one human and one AI at the table. Every AI seat plays with a
 * personality since v5.1 (random when not chosen), so any AI counts.
 */
export function trucesApply(seats: { kind: SeatDraft['kind']; personality?: AiPersonality }[]): boolean {
  return seats.some((s) => s.kind === 'human') && seats.some((s) => s.kind === 'ai');
}

export function defaultDraft(): NewGameDraft {
  return {
    seats: [
      { name: PLAYER_COLORS[DEFAULT_SEAT_COLORS[0]].name, color: DEFAULT_SEAT_COLORS[0], kind: 'human', difficulty: 'normal' },
      { name: PLAYER_COLORS[DEFAULT_SEAT_COLORS[1]].name, color: DEFAULT_SEAT_COLORS[1], kind: 'ai', difficulty: 'normal' },
      { name: PLAYER_COLORS[DEFAULT_SEAT_COLORS[2]].name, color: DEFAULT_SEAT_COLORS[2], kind: 'ai', difficulty: 'normal' },
      { name: PLAYER_COLORS[DEFAULT_SEAT_COLORS[3]].name, color: DEFAULT_SEAT_COLORS[3], kind: 'ai', difficulty: 'normal' },
    ],
    length: 'evening',
    setup: 'quickDeal',
    // v5.1 D: house rules off (neutral seat, missions); standing (`truces`, config.diplomacy) is the game, not a rule.
    house: { draft: false, cardBonus: 'progressive', fortifyRule: 'connected', setupBatch: 'auto', seed: null, neutral: false, truces: true, missions: false },
    mapId: DEFAULT_MAP_ID,
    v51: true,
  };
}

/** Sanitize a remembered draft (from localStorage) into a valid one. */
export function sanitizeDraft(x: unknown): NewGameDraft {
  const d = defaultDraft();
  if (!x || typeof x !== 'object') return d;
  const o = x as Partial<NewGameDraft>;
  // A pre-v5.1 draft: its personalities were auto-filled and its house rules were the old defaults, not choices.
  const fresh = o.v51 === true;
  const seats = Array.isArray(o.seats)
    ? o.seats
        .filter((s) => s && typeof s === 'object' && PLAYER_COLOR_IDS.includes(s.color))
        .slice(0, 4)
        .map((s) => ({
          // Older drafts defaulted humans to "Player N"; seats now default to their color's name (R1-16). A name
          // that is a colour id ('Cobalt', from before the ink palette) is the old default too: its display name.
          name:
            typeof s.name === 'string' && !/^Player \d$/.test(s.name.trim()) && !(PLAYER_COLOR_IDS as string[]).includes(s.name.trim().toLowerCase())
              ? s.name.slice(0, 24)
              : PLAYER_COLORS[s.color].name,
          color: s.color,
          kind: s.kind === 'ai' ? ('ai' as const) : ('human' as const),
          difficulty: s.difficulty === 'easy' || s.difficulty === 'hard' ? s.difficulty : ('normal' as const),
          ...(fresh && isPersonality(s.personality) ? { personality: s.personality } : {}),
        }))
    : d.seats;
  return {
    seats: fillPersonalities(seats.length >= 2 ? seats : d.seats),
    mapId: typeof o.mapId === 'string' && !isHiddenMap(o.mapId) ? mapIdOf(o.mapId) : DEFAULT_MAP_ID,
    length: o.length === 'quick' || o.length === 'full' ? o.length : 'evening',
    setup: o.setup === 'placeOwn' ? 'placeOwn' : 'quickDeal',
    v51: true,
    house: {
      draft: false, // v6: Draft setup is no longer offered
      cardBonus: o.house?.cardBonus === 'fixed' ? 'fixed' : 'progressive',
      fortifyRule: o.house?.fortifyRule === 'adjacent' ? 'adjacent' : 'connected',
      setupBatch:
        typeof o.house?.setupBatch === 'number' && o.house.setupBatch >= 1 ? Math.floor(o.house.setupBatch) : 'auto',
      seed: typeof o.house?.seed === 'number' && Number.isFinite(o.house.seed) ? o.house.seed >>> 0 : null,
      // v5.1 D: the neutral seat is off unless switched on (a pre-v5.1 draft's `true` was the old default)
      neutral: fresh && o.house?.neutral === true,
      truces: o.house?.truces !== false,
      // v5 G: off unless switched on
      missions: fresh && o.house?.missions === true,
    },
  };
}

/**
 * Win rules per length preset. 2 players are dealt 50% each, so their thresholds sit higher (lead notes).
 * With the neutral seat each player starts on a third of the board, as in a 3-player game, so 2 players
 * use the 3-player thresholds.
 */
export function lengthRules(
  length: LengthPreset,
  players: number,
  neutral = false,
): { dominationPercent: number; turnLimit: number | null } {
  const two = players === 2 && !neutral;
  switch (length) {
    case 'quick':
      // v6: 60% with an 8-round cap (most territories at the cap); 2 players keep 75% (60% is reached in round 1).
      return { dominationPercent: two ? 75 : 60, turnLimit: 8 };
    case 'evening':
      return { dominationPercent: two ? 80 : 70, turnLimit: null };
    case 'full':
      return { dominationPercent: 100, turnLimit: null };
  }
}

/**
 * Two passes of manual placement: ceil((startingArmies − floor(size / n)) / 2), size = the map's territory
 * count (classic: 42 → 10 for 2p/4p, 11 for 3p). Defaults read classic.
 */
export function autoSetupBatch(players: number, startingArmies?: number, size?: number): number {
  const def = mapDefOf(null);
  const armies = startingArmies ?? def.startingArmies[players] ?? minStartingArmies(def, players);
  return Math.max(1, Math.ceil((armies - Math.floor((size ?? def.size) / players)) / 2));
}

/** autoSetupBatch on a map (its starting armies and size). */
function autoSetupBatchFor(n: number, mapId?: string): number {
  const def = mapDefOf({ mapId: mapIdOf(mapId ?? null) });
  return autoSetupBatch(n, def.startingArmies[n] ?? minStartingArmies(def, n), def.size);
}

/** Territories to win at `percent` of the map (`config.mapId`, absent = classic). */
export function territoriesToWin(percent: number, config?: { mapId?: string } | null): number {
  // the engine's helper: ceil(size × percent / 100), exactly what territoriesNeeded uses in the game
  return targetTerritories(mapDefOf(config), percent);
}

/** "of the world" on a world map (classic rules), "of the map" on any other board. */
function ofWhere(mapId?: string): string {
  return packData(mapIdOf(mapId ?? null)).rulesFrom === DEFAULT_MAP_ID ? 'of the world' : 'of the map';
}

export function draftToConfig(d: NewGameDraft, seed: number): GameConfig {
  const n = d.seats.length;
  const neutral = usesNeutral(d);
  const { dominationPercent, turnLimit } = lengthRules(d.length, n, neutral);
  // v5.1 D: an AI seat without a chosen personality gets one at random from the seed.
  const drawn = randomPersonalities(d.seats, d.house.seed ?? seed);
  const players = d.seats.map((s, i) => ({
    name: s.name.trim() || PLAYER_COLORS[s.color].name,
    color: s.color,
    kind: s.kind,
    ...(s.kind === 'ai' ? { difficulty: s.difficulty } : {}),
    ...(s.kind === 'ai' && drawn[i] ? { personality: drawn[i] } : {}),
    // v6: Hard means extra armies a turn (DIFFICULTY_HANDICAP).
    ...(s.kind === 'ai' && DIFFICULTY_HANDICAP[s.difficulty] > 0 ? { handicap: DIFFICULTY_HANDICAP[s.difficulty] } : {}),
  }));
  const diplomacy = d.house.truces !== false && trucesApply(players);
  return {
    ...(neutral ? { neutral: true } : {}),
    ...(diplomacy ? { diplomacy: true } : {}),
    ...(d.house.missions === true && missionsApply(d) ? { missions: true } : {}),
    ...(CAPITALS_ON_BY_SEATS[n] ? { capitals: { ...CAPITALS_RULE } } : {}),
    mapId: mapIdOf(d.mapId ?? null),
    players,
    // v6: Draft setup is no longer offered (it pushed the 2-player first mover to ~90%); territories are dealt.
    setupMode: 'random',
    initialPlacement: d.setup === 'placeOwn' ? 'manual' : 'auto',
    setupBatch: d.house.setupBatch === 'auto' ? autoSetupBatchFor(n, d.mapId) : d.house.setupBatch,
    cardBonus: d.house.cardBonus,
    fortifyRule: d.house.fortifyRule,
    dominationPercent,
    turnLimit,
    seed: d.house.seed ?? seed,
  };
}

// v6: rounds until someone first holds X% of the board, measured per map: [median, p90]. The shipped table (seat 0
// a person who moves first, played by the classic Normal AI; the other seats Normal AIs with random
// personalities; standing on; quick deal; capitals +1 at 3–4 seats), played to full conquest, n=400 games per row,
// `npx tsx scripts/v6/rounds.ts 400` (2026-11-10). '2n' = 2 players plus the neutral seat. Re-run and paste if the
// AI, the rules or a map change. Replaces v5's size scaling of classic's table.
type RoundsRow = Record<number, [number, number]>;
const ROUNDS_BY_MAP: Record<string, Record<number | '2n', RoundsRow>> = {
  'classic': {
    2: { 60: [1, 2], 70: [5, 8], 75: [5, 9], 80: [6, 9], 100: [8, 12] },
    3: { 60: [7, 12], 70: [9, 16], 75: [10, 18], 80: [11, 20], 100: [14, 25] },
    4: { 60: [10, 14], 70: [12, 18], 75: [13, 19], 80: [13, 20], 100: [17, 27] },
    '2n': { 60: [7, 11], 70: [8, 13], 75: [9, 14], 80: [10, 15], 100: [11, 17] },
  },
  'true-world': {
    2: { 60: [1, 2], 70: [5, 8], 75: [5, 9], 80: [6, 9], 100: [8, 12] },
    3: { 60: [7, 12], 70: [9, 16], 75: [10, 18], 80: [11, 20], 100: [14, 25] },
    4: { 60: [10, 14], 70: [12, 18], 75: [13, 19], 80: [13, 20], 100: [17, 27] },
    '2n': { 60: [7, 11], 70: [8, 13], 75: [9, 14], 80: [10, 15], 100: [11, 17] },
  },
  'roman-empire': {
    2: { 60: [1, 2], 70: [5, 9], 75: [6, 9], 80: [6, 10], 100: [9, 13] },
    3: { 60: [6, 13], 70: [9, 18], 75: [10, 19], 80: [10, 19], 100: [13, 26] },
    4: { 60: [10, 15], 70: [12, 18], 75: [12, 19], 80: [13, 21], 100: [16, 27] },
    '2n': { 60: [6, 9], 70: [8, 11], 75: [8, 12], 80: [9, 13], 100: [10, 15] },
  },
  'italian-conquest': {
    2: { 60: [1, 2], 70: [4, 7], 75: [5, 9], 80: [6, 9], 100: [8, 12] },
    3: { 60: [6, 11], 70: [9, 16], 75: [9, 17], 80: [10, 19], 100: [13, 23] },
    4: { 60: [10, 14], 70: [12, 17], 75: [12, 19], 80: [13, 21], 100: [16, 27] },
    '2n': { 60: [6, 10], 70: [7, 12], 75: [8, 13], 80: [8, 13], 100: [10, 16] },
  },
  'modern-boston': {
    2: { 60: [1, 2], 70: [4, 6], 75: [5, 8], 80: [5, 8], 100: [7, 11] },
    3: { 60: [5, 9], 70: [7, 13], 75: [7, 14], 80: [8, 14], 100: [11, 18] },
    4: { 60: [7, 10], 70: [8, 13], 75: [9, 14], 80: [10, 14], 100: [12, 19] },
    '2n': { 60: [5, 8], 70: [7, 12], 75: [8, 12], 80: [8, 13], 100: [9, 16] },
  },
};
/** Humans attack less eagerly than the sim's AIs, so real games run a few more rounds. */
const HUMAN_ROUND_FACTOR = 1.3;
/** Seconds per human turn: UX.md §4.3 puts early turns at 60–90 s; later turns carry more fights. */
const HUMAN_TURN_S = 80;
/** Seconds per AI turn at `watch`: measured in the real app (tests/e2e/round.e2e.ts, median ≈ 5 s). */
const AI_TURN_S = 5;

function fmtRange(loMin: number, hiMin: number): string {
  const r5 = (m: number) => Math.max(5, Math.round(m / 5) * 5);
  if (hiMin <= 100) {
    const a = r5(loMin);
    const b = r5(hiMin);
    return a === b ? `~${a} min` : `~${a}–${b} min`;
  }
  const h = (m: number) => Math.max(1, Math.round((m / 60) * 2) / 2);
  const a = h(loMin);
  const b = h(hiMin);
  const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
  return a === b ? `~${fmt(a)} h` : `~${fmt(a)}–${fmt(b)} h`;
}

/** The measured rounds row for a map and table (an unmeasured map reads classic's). */
function roundsRow(mapId: string | undefined, n: number, neutral: boolean): RoundsRow {
  const m = ROUNDS_BY_MAP[mapIdOf(mapId ?? null)] ?? ROUNDS_BY_MAP[DEFAULT_MAP_ID] ?? ROUNDS_BY_MAP.classic;
  return (neutral ? m['2n'] : m[n]) ?? ROUNDS_BY_MAP.classic[n];
}

export function lengthEstimate(length: LengthPreset, seats: SeatDraft[], neutral = false, mapId?: string): string {
  const n = Math.min(4, Math.max(2, seats.length));
  const withNeutral = neutral && n === 2;
  const { dominationPercent, turnLimit } = lengthRules(length, n, withNeutral);
  const table = roundsRow(mapId, n, withNeutral);
  const row: [number, number] = table[dominationPercent] ?? table[70];
  const humans = seats.filter((s) => s.kind === 'human').length;
  const perRound = humans * HUMAN_TURN_S + (n - humans) * AI_TURN_S;
  const cap = (r: number) => (turnLimit ? Math.min(turnLimit, r) : r);
  // Centre on the median; the sim's p90 tail is long, so cap the top at 1.6× the median.
  const lo = (cap(row[0] * 0.8 * HUMAN_ROUND_FACTOR) * perRound) / 60;
  const hi = (cap(Math.min(row[1], row[0] * 1.6) * HUMAN_ROUND_FACTOR) * perRound) / 60;
  return fmtRange(lo, hi);
}

export function draftProblems(d: NewGameDraft): string[] {
  const out: string[] = [];
  const colors = new Map<PlayerColorId, number>();
  for (const s of d.seats) colors.set(s.color, (colors.get(s.color) ?? 0) + 1);
  for (const [c, n] of colors) if (n > 1) out.push(`Two seats share ${PLAYER_COLORS[c].name}`);
  const names = new Map<string, number>();
  for (const s of d.seats) {
    const k = s.name.trim().toLowerCase();
    if (k) names.set(k, (names.get(k) ?? 0) + 1);
  }
  for (const [k, n] of names) {
    if (n > 1) out.push(`Two seats are called ${d.seats.find((s) => s.name.trim().toLowerCase() === k)!.name.trim()}`);
  }
  if (d.seats.length < 2) out.push('At least 2 seats');
  // v6: a map plays only its seat range (createGame refuses the rest).
  const p = packData(mapIdOf(d.mapId ?? null));
  const { min, max } = p.rules.seats;
  if (d.seats.length >= 2 && (d.seats.length < min || d.seats.length > max)) {
    out.push(`${p.manifest.name} is for ${min === max ? min : `${min}–${max}`} players`);
  }
  return out;
}

export function draftSummary(d: NewGameDraft): string {
  const n = d.seats.length;
  const { dominationPercent, turnLimit } = lengthRules(d.length, n, usesNeutral(d));
  const deal = 'Territories dealt at random';
  const place = d.setup === 'quickDeal' ? 'armies placed for you' : 'you place your own armies';
  const need = territoriesToWin(dominationPercent, { mapId: mapIdOf(d.mapId ?? null) });
  // v5 G: with Missions on, a secret mission is the other way to win.
  const m = d.house.missions === true && missionsApply(d);
  const goal =
    dominationPercent >= 100
      ? `take every territory${m ? ' or complete your secret mission' : ''} to win`
      : turnLimit
        ? `first to ${need} territories${m ? ' or a secret mission' : ''}, or most after ${turnLimit} rounds`
        : `first to ${need} territories${m ? ' or a secret mission' : ''} wins`;
  return [deal, place, goal].join(SEP);
}

export function buildNewGameVM(d: NewGameDraft): NewGameVM {
  const n = d.seats.length;
  const neutral = usesNeutral(d);
  const q = lengthRules('quick', n, neutral);
  const e = lengthRules('evening', n, neutral);
  const problems = draftProblems(d);
  return {
    seats: d.seats,
    length: d.length,
    setup: d.setup,
    house: d.house,
    lengthOptions: [
      { id: 'quick', label: 'Quick', detail: `${q.dominationPercent}% or ${q.turnLimit} rounds`, estimate: lengthEstimate('quick', d.seats, neutral, d.mapId) },
      { id: 'evening', label: 'Evening', detail: `${e.dominationPercent}% ${ofWhere(d.mapId)}`, estimate: lengthEstimate('evening', d.seats, neutral, d.mapId) },
      { id: 'full', label: 'Full conquest', detail: 'every territory', estimate: lengthEstimate('full', d.seats, neutral, d.mapId) },
    ],
    setupOptions: [
      { id: 'quickDeal', label: 'Quick deal', detail: 'armies placed for you' },
      { id: 'placeOwn', label: 'Place your own', detail: '~3 min' },
    ],
    summary: draftSummary(d),
    canStart: problems.length === 0 && n >= 2 && n <= 4,
    problems,
    canAddSeat: n < 4,
    canRemoveSeat: n > 2,
    missionsApply: missionsApply(d),
  };
}

/**
 * Apply a seat patch with the naming conventions: every seat defaults to its color's name, a default
 * name follows the seat's color, and flipping Human/AI never renames a seat (R1-16).
 */
export function patchSeat(d: NewGameDraft, index: number, patch: Partial<SeatDraft>): NewGameDraft {
  const seats = d.seats.map((s) => ({ ...s }));
  const s = seats[index];
  if (!s) return d;
  const wasDefaultName =
    !s.name.trim() || /^Player \d$/.test(s.name.trim()) || s.name === PLAYER_COLORS[s.color].name;
  const next = { ...s, ...patch };
  if (patch.name === undefined && wasDefaultName) next.name = PLAYER_COLORS[next.color].name;
  seats[index] = next;
  return { ...d, seats: fillPersonalities(seats) };
}

export function addSeat(d: NewGameDraft): NewGameDraft {
  if (d.seats.length >= 4) return d;
  const used = new Set(d.seats.map((s) => s.color));
  const color = [...DEFAULT_SEAT_COLORS, ...PLAYER_COLOR_IDS].find((c) => !used.has(c)) ?? 'emerald';
  return {
    ...d,
    seats: fillPersonalities([...d.seats, { name: PLAYER_COLORS[color].name, color, kind: 'ai', difficulty: 'normal' }]),
  };
}

export function removeSeat(d: NewGameDraft, index: number): NewGameDraft {
  if (d.seats.length <= 2) return d;
  return { ...d, seats: d.seats.filter((_, i) => i !== index) };
}
