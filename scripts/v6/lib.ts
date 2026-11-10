// v6 design audit harness (read-only on src/): plays engine games with the shipped AI and records a
// trajectory rich enough to answer pacing / balance / snowball / decision-density questions.
// Hooks let an experiment mutate the initial state (compensation armies, etc.) or override actions
// (first player skips round-1 attacks, etc.) without touching src/.

import {
  applyAction,
  chooseAiAction,
  createGame,
  mapDefOf,
  reinforcementsFor,
  targetTerritories,
  type Action,
  type GameConfig,
  type GameState,
  type PlayerConfig,
  type AiPersonality,
} from '../../src/engine';
import { hashInts } from '../../src/engine/rng';

export const COLORS = ['crimson', 'cobalt', 'emerald', 'amber'] as const;

export interface TurnRec {
  round: number;
  player: number;
  kind: 'human' | 'ai';
  /** Engagements (attack/blitz actions). */
  fights: number;
  rolls: number;
  conquests: number;
  reinforceActions: number;
  reinforceTotal: number;
  /** Occupy prompts (min < max: a real slider). */
  occupyPrompts: number;
  /** Occupy prompts the AI resolved at max (march everyone) or min. */
  occupyAtMax: number;
  occupyAtMin: number;
  fortified: boolean;
  trades: number;
  tradeArmies: number;
  forcedTrade: boolean;
  /** Seat's rank by territories at turn start (0 = leader). */
  rank: number;
  alive: number;
}

export interface RoundSnap {
  round: number;
  terr: number[];
  armies: number[];
  income: number[];
  cards: number[];
  alive: boolean[];
}

export interface GameRec {
  seed: number;
  n: number;
  mapId: string;
  winner: number;
  firstPlayer: number;
  reason: string;
  by?: string;
  rounds: number;
  turns: TurnRec[];
  snaps: RoundSnap[];
  /** Round each seat was knocked out (undefined = never). */
  elimRound: (number | undefined)[];
  /** Round some seat first reached X% of the board. */
  reach: Record<number, number>;
  /** Who first reached X%. */
  reachBy: Record<number, number>;
  /** Trades: round, player, value, trader's territory rank, alive count. */
  trades: { round: number; player: number; value: number; rank: number; alive: number }[];
  /** Continent holder at every turn start: [continent] -> count of turn starts held by anyone; and hold spells. */
  contHeld: Record<string, number>;
  contSpells: Record<string, number[]>;
  turnStarts: number;
  /** Lead changes (territory leader at round start differs from previous). */
  leadChanges: number;
  personalities: (AiPersonality | 'classic' | 'human')[];
  /** conquests[attacker][victim]. */
  hits: number[][];
}

export interface Hooks {
  /** Mutate the freshly created state (before any action). */
  init?: (s: GameState) => void;
  /** Return a replacement action, or null to keep the AI's. */
  override?: (s: GameState, a: Action) => Action | null;
  /** Stop the game early (e.g., at a threshold) — we normally play full conquest and derive. */
  maxRounds?: number;
  /** Mutate the state right after an action is applied (e.g. re-value a card trade). */
  post?: (s: GameState, a: Action, events: readonly { type: string }[]) => void;
}

const THRESH = [50, 60, 65, 70, 75, 80, 90, 100];

function counts(s: GameState) {
  const m = mapDefOf(s.config);
  const n = s.players.length;
  const terr = new Array(n).fill(0);
  const armies = new Array(n).fill(0);
  for (const t of m.territoryIds) {
    const x = s.territories[t];
    if (x.owner >= 0) {
      terr[x.owner]++;
      armies[x.owner] += x.armies;
    }
  }
  return { terr, armies };
}

export function playRecorded(config: GameConfig, hooks: Hooks = {}): GameRec {
  let { state } = createGame(config);
  if (hooks.init) hooks.init(state);
  const m = mapDefOf(state.config);
  const contIds = m.continentIds;
  const n = state.players.length;
  const rec: GameRec = {
    seed: config.seed,
    n: config.players.length,
    mapId: config.mapId ?? 'classic',
    winner: -1,
    firstPlayer: state.firstPlayer,
    reason: '',
    rounds: 0,
    turns: [],
    snaps: [],
    elimRound: new Array(n).fill(undefined),
    reach: {},
    reachBy: {},
    trades: [],
    contHeld: Object.fromEntries(contIds.map((c) => [c, 0])),
    contSpells: Object.fromEntries(contIds.map((c) => [c, []])),
    turnStarts: 0,
    leadChanges: 0,
    personalities: state.players.map((p) => (p.kind === 'human' ? 'human' : (p.personality ?? 'classic'))),
    hits: state.players.map(() => new Array(n).fill(0)),
  };
  const spellStart: Record<string, { owner: number; round: number } | null> = Object.fromEntries(contIds.map((c) => [c, null]));
  let cur: TurnRec | null = null;
  let lastRound = -1;
  let lastLeader = -1;
  const snap = () => {
    const { terr, armies } = counts(state);
    rec.snaps.push({
      round: state.round,
      terr,
      armies,
      income: state.players.map((p) => (p.eliminated || p.neutral ? 0 : reinforcementsFor(state, p.id).total)),
      cards: state.players.map((p) => p.cards.length),
      alive: state.players.map((p) => !p.eliminated && !p.neutral),
    });
    const real = terr.map((t, i) => (state.players[i].neutral ? -1 : t));
    const leader = real.indexOf(Math.max(...real));
    if (lastLeader >= 0 && leader !== lastLeader) rec.leadChanges++;
    lastLeader = leader;
  };
  const track = () => {
    if (state.round === 0) return;
    const { terr } = counts(state);
    for (const pct of THRESH) {
      if (rec.reach[pct] !== undefined) continue;
      const need = targetTerritories(m, pct);
      for (let i = 0; i < n; i++) {
        if (state.players[i].neutral) continue;
        if (terr[i] >= need) {
          rec.reach[pct] = state.round;
          rec.reachBy[pct] = i;
          break;
        }
      }
    }
  };
  let guard = 0;
  const maxR = hooks.maxRounds ?? 400;
  while (state.phase.kind !== 'game-over') {
    if (++guard > 300_000 || state.round > maxR) break;
    const me = state.currentPlayer;
    let action = chooseAiAction(state, me);
    if (hooks.override) {
      const o = hooks.override(state, action);
      if (o) action = o;
    }
    const phaseBefore = state.phase;
    const res = applyAction(state, action);
    if (!res.ok) throw new Error(`rejected ${JSON.stringify(action)}: ${res.error}`);
    // bookkeeping on the action
    if (cur && cur.player === me) {
      if (action.type === 'attack' || action.type === 'blitz') cur.fights++;
      if (action.type === 'reinforce') {
        cur.reinforceActions++;
        cur.reinforceTotal += action.count;
      }
      if (action.type === 'occupy' && phaseBefore.kind === 'occupy') {
        cur.occupyPrompts++;
        if (action.count === phaseBefore.max) cur.occupyAtMax++;
        else if (action.count === phaseBefore.min) cur.occupyAtMin++;
      }
      if (action.type === 'fortify') cur.fortified = true;
      if (action.type === 'trade') {
        cur.trades++;
        if (phaseBefore.kind === 'reinforce' && phaseBefore.mustTrade) cur.forcedTrade = true;
      }
    }
    state = res.state;
    if (hooks.post) hooks.post(state, action, res.events);
    for (const e of res.events) {
      switch (e.type) {
        case 'turnStarted': {
          if (state.round !== lastRound) {
            snap();
            lastRound = state.round;
          }
          const { terr } = counts(state);
          const sorted = [...terr].map((t, i) => (state.players[i].eliminated || state.players[i].neutral ? -1 : t));
          const rank = sorted.filter((t) => t > terr[e.player]).length;
          cur = {
            round: e.round,
            player: e.player,
            kind: state.players[e.player].kind,
            fights: 0,
            rolls: 0,
            conquests: 0,
            reinforceActions: 0,
            reinforceTotal: 0,
            occupyPrompts: 0,
            occupyAtMax: 0,
            occupyAtMin: 0,
            fortified: false,
            trades: 0,
            tradeArmies: 0,
            forcedTrade: false,
            rank,
            alive: state.players.filter((p) => !p.eliminated && !p.neutral).length,
          };
          rec.turns.push(cur);
          rec.turnStarts++;
          for (const c of contIds) {
            const ts = m.continents[c].territories;
            const o = state.territories[ts[0]].owner;
            const held = o >= 0 && !state.players[o].neutral && ts.every((t) => state.territories[t].owner === o);
            if (held) rec.contHeld[c]++;
            const sp = spellStart[c];
            if (held && (!sp || sp.owner !== o)) {
              if (sp) rec.contSpells[c].push(rec.turnStarts - sp.round);
              spellStart[c] = { owner: o, round: rec.turnStarts };
            } else if (!held && sp) {
              rec.contSpells[c].push(rec.turnStarts - sp.round);
              spellStart[c] = null;
            }
          }
          break;
        }
        case 'diceRolled':
          if (cur) cur.rolls++;
          break;
        case 'territoryConquered':
          if (cur) cur.conquests++;
          if (e.previousOwner >= 0) rec.hits[e.player][e.previousOwner]++;
          break;
        case 'cardsTraded': {
          const ev = e as unknown as { player: number; armies?: number; value?: number; bonus?: number };
          const v = ev.armies ?? ev.value ?? 0;
          if (cur) cur.tradeArmies += v;
          const { terr } = counts(state);
          const rank = terr.filter((t, i) => i !== ev.player && !state.players[i].eliminated && !state.players[i].neutral && t > terr[ev.player]).length;
          rec.trades.push({ round: state.round, player: ev.player, value: v, rank, alive: state.players.filter((p) => !p.eliminated && !p.neutral).length });
          break;
        }
        case 'playerEliminated':
          rec.elimRound[e.player] = state.round;
          break;
        case 'gameOver':
          rec.winner = e.winner;
          rec.reason = e.reason;
          if ((e as { by?: string }).by) rec.by = (e as { by?: string }).by;
          break;
      }
    }
    track();
  }
  rec.rounds = state.round;
  // close continent spells
  for (const c of contIds) {
    const sp = spellStart[c];
    if (sp) rec.contSpells[c].push(rec.turnStarts - sp.round);
  }
  snap();
  return rec;
}

// ---------------------------------------------------------------------------------------------------
// Table builders
// ---------------------------------------------------------------------------------------------------

const PERS: AiPersonality[] = ['turtle', 'opportunist', 'warlord'];

/**
 * The shipped default table: seat 0 a "human" (played by the classic normal AI as a proxy), every other
 * seat a normal AI with a random personality (drawn without repeats, like presets.randomPersonalities).
 * diplomacy on (standing), random deal, auto placement, progressive cards, connected fortify.
 */
export function defaultTable(i: number, n: number, over: Partial<GameConfig> = {}, humans = 1): GameConfig {
  const bag = [...PERS];
  // seeded shuffle
  for (let k = bag.length - 1; k > 0; k--) {
    const j = hashInts(i, k, 991) % (k + 1);
    [bag[k], bag[j]] = [bag[j], bag[k]];
  }
  const players: PlayerConfig[] = Array.from({ length: n }, (_, k) =>
    k < humans
      ? { name: `H${k}`, color: COLORS[k], kind: 'human' }
      : { name: `A${k}`, color: COLORS[k], kind: 'ai', difficulty: 'normal', personality: bag[(k - humans) % 3] },
  );
  return {
    players,
    setupMode: 'random',
    initialPlacement: 'auto',
    setupBatch: 5,
    cardBonus: 'progressive',
    fortifyRule: 'connected',
    dominationPercent: 100,
    turnLimit: null,
    seed: hashInts(0xd351, n, i),
    ...(humans > 0 && humans < n ? { diplomacy: true } : {}),
    ...over,
  };
}

/** All-classic normal AIs (the stock sim's 'len' tables). */
export function classicTable(i: number, n: number, over: Partial<GameConfig> = {}): GameConfig {
  return {
    players: Array.from({ length: n }, (_, k) => ({ name: `N${k}`, color: COLORS[k], kind: 'ai', difficulty: 'normal' })),
    setupMode: 'random',
    initialPlacement: 'auto',
    setupBatch: 5,
    cardBonus: 'progressive',
    fortifyRule: 'connected',
    dominationPercent: 100,
    turnLimit: null,
    seed: hashInts(0xc1a5, n, i),
    ...over,
  };
}

// ---------------------------------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------------------------------

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
export const q = (xs: number[], f: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : NaN;
};
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');
/** 95% CI half-width for a proportion, in percentage points. */
export const ci = (p: number, n: number) => (n ? (196 * Math.sqrt((p * (1 - p)) / n)).toFixed(1) : '—');

/** Round in which a game at `pct`% threshold (and optional turn limit) would have ended, given a full trajectory. */
export function endRound(g: GameRec, pctT: number, turnLimit: number | null): number {
  const r = g.reach[pctT] ?? g.rounds;
  return turnLimit ? Math.min(turnLimit, r) : r;
}

// ---------------------------------------------------------------------------------------------------
// v6: run a job across child processes (pure node, no install). A script calls `worker(fn)` once at the
// top level, after its imports; a child runs fn(key, i) for its share of i and exits. The parent calls
// `run(key, n)` to get every result in index order.
// ---------------------------------------------------------------------------------------------------

import { spawn } from 'node:child_process';

const MARK = '@@SIMRESULT@@';

export function worker(fn: (key: string, i: number) => unknown): void {
  const key = process.env.SIM_KEY;
  const shard = process.env.SIM_SHARD;
  if (!key || !shard) return;
  const [k, K, n] = shard.split('/').map(Number);
  const out: [number, unknown][] = [];
  for (let i = k; i < n; i += K) out.push([i, fn(key, i)]);
  process.stdout.write(`${MARK}${JSON.stringify(out)}\n`, () => process.exit(0));
}

export async function run<R>(key: string, n: number, workers = Number(process.env.SIM_WORKERS ?? 5)): Promise<R[]> {
  const K = Math.max(1, Math.min(workers, n));
  const parts = await Promise.all(
    Array.from({ length: K }, (_, k) =>
      new Promise<[number, R][]>((resolve, reject) => {
        const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
          env: { ...process.env, SIM_KEY: key, SIM_SHARD: `${k}/${K}/${n}` },
          stdio: ['ignore', 'pipe', 'inherit'],
        });
        let buf = '';
        child.stdout.on('data', (d) => (buf += d));
        child.on('close', (code) => {
          const line = buf.split('\n').find((l) => l.startsWith(MARK));
          if (code !== 0 || !line) reject(new Error(`shard ${k} of ${key} failed (${code})`));
          else resolve(JSON.parse(line.slice(MARK.length)));
        });
      }),
    ),
  );
  const out = new Array<R>(n);
  for (const p of parts) for (const [i, r] of p) out[i] = r;
  return out;
}

export const isWorker = (): boolean => !!process.env.SIM_KEY;
