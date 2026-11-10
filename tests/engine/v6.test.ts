// v6 rules (docs/SPEC.md §11.9): the quiet opening, a person moves first, handicap, capitals, threatOf, scarce peace.
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  attacksLocked,
  canAskPeace,
  capitalHolders,
  chooseAiAction,
  createGame,
  legalActionsSummary,
  mapOf,
  OPENING_NO_ATTACK,
  pickCapital,
  reinforcementsFor,
  threatOf,
  type Action,
  type GameEvent,
  type GameState,
  type PlayerConfig,
} from '../../src/engine';
import { act, config, passTurn, reject, scenario, seats } from './helpers';

/** The first attack the current player could make (from its biggest stack), or null. */
function anyAttack(s: GameState): Action | null {
  const m = mapOf(s);
  const p = s.currentPlayer;
  for (const t of m.territoryIds) {
    if (s.territories[t].owner !== p || s.territories[t].armies < 2) continue;
    const to = m.adjacency[t].find((n) => s.territories[n].owner !== p);
    if (to) return { type: 'blitz', player: p, from: t, to };
  }
  return null;
}

/** Reinforce everything on one border territory and end the reinforce step. */
function toAttack(s: GameState): GameState {
  const m = mapOf(s);
  const p = s.currentPlayer;
  const ph = s.phase as Extract<GameState['phase'], { kind: 'reinforce' }>;
  const t = m.territoryIds.find((x) => s.territories[x].owner === p && m.adjacency[x].some((n) => s.territories[n].owner !== p))!;
  s = act(s, { type: 'reinforce', player: p, territory: t, count: ph.remaining }).state;
  return act(s, { type: 'endReinforce', player: p }).state;
}

describe('v6 quiet opening (2 players)', () => {
  it('the first player places and fortifies but may not attack on the opening turn; the reply may', () => {
    let s = toAttack(createGame(config(2)).state);
    expect(attacksLocked(s)).toBe(true);
    const sum = legalActionsSummary(s);
    expect(sum.attacksLocked).toBe(true);
    expect(sum.attackSources).toEqual([]);
    expect(sum.canEndAttack).toBe(true);
    expect(reject(s, anyAttack(s)!)).toBe(OPENING_NO_ATTACK);
    s = act(s, { type: 'endAttack', player: s.currentPlayer }).state;
    expect(s.phase.kind).toBe('fortify');
    s = act(s, { type: 'endTurn', player: s.currentPlayer }).state;
    s = toAttack(s);
    expect(attacksLocked(s)).toBe(false);
    expect(legalActionsSummary(s).attacksLocked).toBeUndefined();
    expect(applyAction(s, anyAttack(s)!).ok).toBe(true);
  });

  it('off at 3–4 seats, with the neutral seat, or when the config says so; on at 3 seats when asked', () => {
    expect(attacksLocked(toAttack(createGame(config(3)).state))).toBe(false);
    expect(attacksLocked(toAttack(createGame(config(2, { neutral: true })).state))).toBe(false);
    expect(attacksLocked(toAttack(createGame(config(2, { quietOpening: false })).state))).toBe(false);
    expect(attacksLocked(toAttack(createGame(config(3, { quietOpening: true })).state))).toBe(true);
  });

  it('the AI respects it: no attack in the opening turn, every move legal', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = createGame({ ...config(2, { seed }), players: seats(2, 'ai') }).state;
      const first = s.firstPlayer;
      while (s.turn === 1) {
        const a = chooseAiAction(s, s.currentPlayer);
        expect(a.type === 'attack' || a.type === 'blitz').toBe(false);
        s = act(s, a).state;
      }
      expect(s.currentPlayer).not.toBe(first);
    }
  });
});

describe('v6 a person moves first', () => {
  const mixed = (humanAt: number[]): PlayerConfig[] => seats(4, 'ai').map((p, i) => (humanAt.includes(i) ? { name: p.name, color: p.color, kind: 'human' } : p));

  it('the first seat is drawn among the human seats', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGame({ ...config(4, { seed }), players: mixed([1, 3]) }).state;
      expect([1, 3]).toContain(s.firstPlayer);
      seen.add(s.firstPlayer);
    }
    expect([...seen].sort()).toEqual([1, 3]);
  });

  it('all-AI tables draw among every seat; config.firstPlayer pins it without moving the deal', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) seen.add(createGame({ ...config(4, { seed }), players: seats(4, 'ai') }).state.firstPlayer);
    expect(seen.size).toBe(4);
    const a = createGame(config(4, { seed: 9 })).state;
    const b = createGame(config(4, { seed: 9, firstPlayer: 2 })).state;
    expect(b.firstPlayer).toBe(2);
    expect(b.deck).toEqual(a.deck); // the draw is still taken
  });
});

describe('v6 handicap', () => {
  it('adds to every turn of that seat, listed in the breakdown', () => {
    const s = createGame(config(3, { players: seats(3).map((p, i) => (i === 1 ? { ...p, handicap: 2 } : p)) })).state;
    const r1 = reinforcementsFor(s, 1);
    const r0 = reinforcementsFor(s, 0);
    expect(r1.handicap).toBe(2);
    expect(r1.total).toBe(r1.base + r1.continents.reduce((a, c) => a + c.bonus, 0) + 2);
    expect(r0.handicap).toBeUndefined();
    // Clamped and dropped by sanitize.
    const big = createGame(config(2, { players: seats(2).map((p) => ({ ...p, handicap: 99 })) })).state;
    expect(big.config.players[0].handicap).toBe(10);
    const none = createGame(config(2, { players: seats(2).map((p) => ({ ...p, handicap: -3 })) })).state;
    expect(none.config.players[0].handicap).toBeUndefined();
  });
});

describe('v6 capitals', () => {
  it('assigned as play starts, without an rng draw, to the territory with the most own neighbours', () => {
    const plain = createGame(config(3, { seed: 4 })).state;
    const s = createGame(config(3, { seed: 4, capitals: { bonus: 2 } })).state;
    expect(s.rng).toBe(plain.rng);
    for (const p of s.players) {
      expect(p.capital).toBe(pickCapital(s, p.id) ?? undefined);
      expect(s.territories[p.capital!].owner).toBe(p.id);
    }
    expect(plain.players.every((p) => p.capital === undefined)).toBe(true);
    expect(capitalHolders(s).map((c) => c.holder)).toEqual([0, 1, 2]);
  });

  it('pays its holder, and taking one names whose capital fell', () => {
    let s = scenario({ players: 3, fill: 0, terr: { alaska: [1, 1], kamchatka: [0, 20], northwest_territory: [1, 1], greenland: [2, 1] }, config: { capitals: { bonus: 2 } } });
    s.players[1].capital = 'alaska';
    s.players[2].capital = 'greenland';
    s.players[0].capital = 'kamchatka';
    expect(reinforcementsFor(s, 0).capitals).toEqual([{ territory: 'kamchatka', of: 0, bonus: 2 }]);
    const r = act(s, { type: 'blitz', player: 0, from: 'kamchatka', to: 'alaska' });
    const ev = r.events.find((e) => e.type === 'territoryConquered') as Extract<GameEvent, { type: 'territoryConquered' }> | undefined;
    if (ev) {
      expect(ev.capitalOf).toBe(1);
      const inc = reinforcementsFor(r.state, 0);
      expect(inc.capitals?.map((c) => c.of)).toEqual([0, 1]);
    }
  });

  it('holdAllWins: holding every capital wins (by: capitals)', () => {
    const s = scenario({ players: 3, fill: 0, terr: { alaska: [1, 1], kamchatka: [0, 30], northwest_territory: [1, 3], greenland: [2, 1], iceland: [2, 3] }, config: { capitals: { bonus: 1, holdAllWins: true }, dominationPercent: 100 } });
    s.players[0].capital = 'kamchatka';
    s.players[1].capital = 'alaska';
    s.players[2].capital = 'peru';
    s.territories.peru = { owner: 0, armies: 1 };
    for (let rng = 1; rng < 200; rng++) {
      const r = applyAction({ ...s, rng }, { type: 'blitz', player: 0, from: 'kamchatka', to: 'alaska' });
      if (!r.ok || !r.events.some((e) => e.type === 'territoryConquered')) continue;
      const over = r.events.find((e) => e.type === 'gameOver');
      expect(over).toMatchObject({ type: 'gameOver', winner: 0, reason: 'percent', by: 'capitals' });
      return;
    }
    throw new Error('no conquest');
  });
});

describe('v6 threatOf', () => {
  it('per seat: territories still needed, the set it could cash, and whether it can plausibly win next turn', () => {
    const s = createGame(config(3, { dominationPercent: 70 })).state;
    const t = threatOf(s);
    expect(t.map((x) => x.player)).toEqual([0, 1, 2]);
    for (const x of t) {
      expect(x.need).toBe(30 - 14);
      expect(x.set).toBeNull();
      expect(x.canWinNext).toBe(false);
    }
    // One seat a territory short with a big stack beside a 1-army neighbour: it can win next turn.
    const near = scenario({ players: 2, fill: 0, terr: { alaska: [1, 1], kamchatka: [0, 12] }, config: { dominationPercent: 100 } });
    for (const t2 of mapOf(near).territoryIds) if (near.territories[t2].owner === 1 && t2 !== 'alaska') near.territories[t2] = { owner: 0, armies: 1 };
    const th = threatOf(near).find((x) => x.player === 0)!;
    expect(th.need).toBe(1);
    expect(th.canWinNext).toBe(true);
  });
});

describe('v6 peace is scarce', () => {
  /** Dan (seat 3, human) to move; Ann, Ben, Cat are AIs with more armies than Dan. */
  function table(): GameState {
    const s = scenario({ players: 4, fill: 0, current: 3, phase: { kind: 'attack' } });
    const ids = mapOf(s).territoryIds;
    ids.forEach((t, i) => (s.territories[t] = { owner: i % 4, armies: i % 4 === 3 ? 1 : 2 }));
    for (const p of [0, 1, 2]) s.players[p] = { ...s.players[p], kind: 'ai', difficulty: 'normal', personality: 'turtle' };
    s.players.forEach((p) => (p.eliminated = false));
    return s;
  }

  it('once a game per AI, one peace at a time, and never with someone stronger', () => {
    let s = table();
    const r = act(s, { type: 'askPeace', player: 3, to: 0 });
    const ans = r.events[0] as Extract<GameEvent, { type: 'peaceAnswered' }>;
    s = r.state;
    if (ans.accepted) {
      expect(canAskPeace(s, 3, 1)).toBe(false); // one at a time
    }
    s.diplomacy!.truces = [];
    expect(canAskPeace(s, 3, 0)).toBe(false); // once a game
    expect(canAskPeace(s, 3, 1)).toBe(true);
    // Stronger: Dan with far more armies than Ben is refused, whatever Ben feels.
    const strong = table();
    for (const t of mapOf(strong).territoryIds) if (strong.territories[t].owner === 3) strong.territories[t].armies = 9;
    const no = act(strong, { type: 'askPeace', player: 3, to: 1 }).events[0] as Extract<GameEvent, { type: 'peaceAnswered' }>;
    expect(no.accepted).toBe(false);
  });

  it('a full AI turn plays out after the opening in a 2-player game', () => {
    let s = createGame({ ...config(2, { seed: 3 }), players: seats(2, 'ai') }).state;
    while (s.turn < 3 && s.phase.kind !== 'game-over') s = act(s, chooseAiAction(s, s.currentPlayer)).state;
    expect(s.turn).toBeGreaterThanOrEqual(3);
    void passTurn;
  });
});
