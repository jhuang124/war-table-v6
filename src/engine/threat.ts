// v6 "the table sees the end coming": who is close to winning, what set they could cash, and whether they can
// plausibly win on their next turn. Pure and cheap (one greedy walk per seat); the UI shows it on the leader's
// line ("Sage needs 8 · holds a 20-army set") and the AI turns on a seat that can win next turn (brain.ts).

import { setValueFor, validSets } from './cards';
import { mapOf, reinforcementsFor, territoriesNeeded, territoryCount } from './rules';
import type { GameState, PlayerId, TerritoryId } from './types';

export interface SeatThreat {
  player: PlayerId;
  /** Territories still needed for the territory goal (config.dominationPercent); 0 once met. */
  need: number;
  /** Armies the best card set in hand would give if traded now (progressive or fixed, without the +2), or null. */
  set: number | null;
  /**
   * An estimate, not a promise: next turn's income plus that set plus the spare armies on its borders, spent
   * cheapest-first on reachable enemy territory, covers `need`. Calibrated with scripts/v6/exp-threat.ts
   * (docs/SPEC.md §11.9).
   */
  canWinNext: boolean;
}

/**
 * Cost model for the greedy walk: taking a territory with d armies costs about LOSS × d armies plus the one left
 * behind. Tuned so a flag is right about half the time and catches most wins (exp-threat.ts).
 */
export const THREAT_MODEL = {
  /** Attacker armies lost per defending army. */
  loss: 3,
  /** Share of the spare armies on its borders other than its biggest stack that count (armies spread thin move late). */
  spareShare: 0,
};

function setNow(s: GameState, p: PlayerId): number | null {
  const hand = s.players[p].cards;
  const sets = validSets(hand);
  if (!sets.length) return null;
  let best = 0;
  for (const ids of sets) {
    const v = setValueFor(s.config, s.tradeCount, ids.map((id) => hand.find((c) => c.id === id)!.symbol));
    if (v > best) best = v;
  }
  return best;
}

/** Territories `p` could plausibly take next turn with `budget` armies (greedy, cheapest reachable first). */
function reach(s: GameState, p: PlayerId, budget: number, cap: number): number {
  const m = mapOf(s);
  const mine = new Set<TerritoryId>();
  for (const t of m.territoryIds) if (s.territories[t].owner === p) mine.add(t);
  const taken = new Set<TerritoryId>();
  let n = 0;
  while (n < cap) {
    let best: TerritoryId | null = null;
    let bc = Infinity;
    for (const t of mine) {
      for (const x of m.adjacency[t]) {
        if (mine.has(x) || taken.has(x)) continue;
        const c = THREAT_MODEL.loss * s.territories[x].armies + 1;
        if (c < bc) {
          bc = c;
          best = x;
        }
      }
    }
    if (!best || bc > budget) break;
    budget -= bc;
    taken.add(best);
    mine.add(best);
    n++;
  }
  return n;
}

/** One seat's threat (see SeatThreat). */
export function threatFor(s: GameState, p: PlayerId): SeatThreat {
  const pl = s.players[p];
  const need = Math.max(0, territoriesNeeded(s) - territoryCount(s, p));
  const set = pl && !pl.neutral ? setNow(s, p) : null;
  if (!pl || pl.eliminated || pl.neutral || s.phase.kind === 'game-over' || s.round === 0) return { player: p, need, set, canWinNext: false };
  const m = mapOf(s);
  let spare = 0;
  let top = 0;
  for (const t of m.territoryIds) {
    const x = s.territories[t];
    if (x.owner !== p || x.armies < 2) continue;
    if (m.adjacency[t].some((n) => s.territories[n].owner !== p)) {
      spare += x.armies - 1;
      top = Math.max(top, x.armies - 1);
    }
  }
  spare = top + (spare - top) * THREAT_MODEL.spareShare;
  const budget = reinforcementsFor(s, p).total + (set ?? 0) + spare;
  return { player: p, need, set, canWinNext: need === 0 || reach(s, p, budget, need) >= need };
}

/** Every seat still in play (not out, not the neutral seat), in seat order. */
export function threatOf(s: GameState): SeatThreat[] {
  return s.players.filter((p) => !p.eliminated && !p.neutral).map((p) => threatFor(s, p.id));
}
