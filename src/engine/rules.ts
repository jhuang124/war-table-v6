// Pure rule helpers shared by the reducer, the AI, and the UI. All cheap, none mutate.
//
// v6 maps: every helper reads the game's own board through `mapOf(state)` (= mapDefOf(state.config)):
// its territory ids, names, continents, bonuses and adjacency. Nothing here assumes the classic 42.

import { mapDefOf, type MapDef } from './mapData';
import { allPackIds } from '../map/packs';
import type {
  ContinentId,
  GameState,
  PlayerId,
  ReinforcementBreakdown,
  TerritoryId,
} from './types';

/** Anything that names its map: a game state, a config, or a map def itself. */
export type MapRef = MapDef | { config: { mapId?: string } } | { mapId?: string } | null | undefined;

/** The board a game (or config, or def) is played on. Absent = the default map (classic). */
export function mapOf(x?: MapRef): MapDef {
  if (!x) return mapDefOf();
  if ('adjacency' in x) return x;
  if ('config' in x) return mapDefOf(x.config);
  return mapDefOf(x);
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Every registered pack's def, the default first (for name lookups that have no game to ask). */
function everyDef(): MapDef[] {
  const first = mapDefOf();
  return [first, ...allPackIds().filter((id) => id !== first.id).map((id) => mapDefOf({ mapId: id }))];
}

/**
 * True when `x` is a territory of the given game's map. Without a map: a territory of any registered
 * pack (callers that hold a game should pass it).
 */
export function isTerritoryId(x: unknown, map?: MapRef): x is TerritoryId {
  if (typeof x !== 'string') return false;
  if (map) return has(mapOf(map).territories, x);
  return everyDef().some((d) => has(d.territories, x));
}

/** A territory's printed name, from the game's map (or, without one, the first pack that has it). */
export function territoryName(t: TerritoryId, map?: MapRef): string {
  if (map) {
    const d = mapOf(map);
    return has(d.territories, t) ? d.territories[t].name : t;
  }
  for (const d of everyDef()) if (has(d.territories, t)) return d.territories[t].name;
  return t;
}

/** A continent's printed name, from the game's map (or, without one, the first pack that has it). */
export function continentName(c: ContinentId, map?: MapRef): string {
  if (map) {
    const d = mapOf(map);
    return has(d.continents, c) ? d.continents[c].name : c;
  }
  for (const d of everyDef()) if (has(d.continents, c)) return d.continents[c].name;
  return c;
}

/**
 * Territories a share of the board comes to: ceil(size × percent / 100), between 1 and the board. The win
 * threshold (`dominationPercent`), the length presets and the sim's reach columns all go through this, so
 * 70 % is 30 of classic's 42 and 9 of a 12-territory board.
 */
export function targetTerritories(def: MapDef, percent: number): number {
  return Math.max(1, Math.min(def.size, Math.ceil((def.size * percent) / 100)));
}

/** The smallest starting-army count that still covers every territory dealt to `seats` seats. */
export function minStartingArmies(def: MapDef, seats: number): number {
  return Math.ceil(def.size / Math.max(1, seats));
}

export function ownedTerritories(state: GameState, player: PlayerId): TerritoryId[] {
  const out: TerritoryId[] = [];
  for (const t of mapOf(state).territoryIds) if (state.territories[t].owner === player) out.push(t);
  return out;
}

export function territoryCount(state: GameState, player: PlayerId): number {
  let n = 0;
  for (const t of mapOf(state).territoryIds) if (state.territories[t].owner === player) n++;
  return n;
}

export function totalArmies(state: GameState, player: PlayerId): number {
  let n = 0;
  for (const t of mapOf(state).territoryIds) {
    const ts = state.territories[t];
    if (ts.owner === player) n += ts.armies;
  }
  return n;
}

/** True if `player` owns every territory of `continent`. */
export function ownsContinent(state: GameState, player: PlayerId, continent: ContinentId): boolean {
  for (const t of mapOf(state).continents[continent].territories) if (state.territories[t].owner !== player) return false;
  return true;
}

/** Continents fully held by `player`. */
export function continentsOwned(state: GameState, player: PlayerId): ContinentId[] {
  return mapOf(state).continentIds.filter((c) => ownsContinent(state, player, c));
}

/** Owner of each continent (or null when split). */
export function continentOwners(state: GameState): Record<ContinentId, PlayerId | null> {
  const m = mapOf(state);
  const out = {} as Record<ContinentId, PlayerId | null>;
  for (const c of m.continentIds) {
    const ts = m.continents[c].territories;
    const o = state.territories[ts[0]].owner;
    out[c] = o >= 0 && ts.every((t) => state.territories[t].owner === o) ? o : null;
  }
  return out;
}

/**
 * Base = max(3, floor(territories / 3)) + the map's continent bonuses. Card trades are separate.
 * v6: + the seat's handicap (PlayerConfig.handicap) + every capital it holds (config.capitals), each listed.
 */
export function reinforcementsFor(state: GameState, player: PlayerId): ReinforcementBreakdown {
  const m = mapOf(state);
  const territoryCount_ = territoryCount(state, player);
  const base = Math.max(3, Math.floor(territoryCount_ / 3));
  const continents = continentsOwned(state, player).map((c) => ({ continent: c, bonus: m.continents[c].bonus }));
  let total = base + continents.reduce((s, c) => s + c.bonus, 0);
  const out: ReinforcementBreakdown = { territoryCount: territoryCount_, base, continents, total };
  const h = handicapOf(state, player);
  if (h > 0) {
    out.handicap = h;
    total += h;
  }
  const bonus = state.config.capitals?.bonus ?? 0;
  if (bonus > 0 && territoryCount_ > 0) {
    const held: { territory: TerritoryId; of: PlayerId; bonus: number }[] = [];
    for (const p of state.players) if (p.capital && state.territories[p.capital]?.owner === player) held.push({ territory: p.capital, of: p.id, bonus });
    if (held.length) {
      out.capitals = held;
      total += bonus * held.length;
    }
  }
  out.total = total;
  return out;
}

/** v6: a seat's per-turn head start (PlayerConfig.handicap; the neutral seat has none). */
export function handicapOf(state: GameState, player: PlayerId): number {
  const h = state.config.players[player]?.handicap;
  return typeof h === 'number' && h > 0 ? h : 0;
}

// ---------------------------------------------------------------------------
// v6: the quiet opening (2 players)
// ---------------------------------------------------------------------------

/** The refusal (and the line the UI shows) for an attack in the quiet opening. */
export const OPENING_NO_ATTACK = 'No attacks on the opening turn.';

/**
 * True when the game uses the quiet opening: config.quietOpening, or (unset) exactly 2 players without the neutral
 * seat (with it the first mover already wins ~51–57% and the rule only adds a round; artifacts/v6-engine/opening.log).
 */
export function quietOpeningOn(config: { players: unknown[]; quietOpening?: boolean; neutral?: boolean }): boolean {
  return config.quietOpening ?? (config.players.length === 2 && !config.neutral);
}

/** True during the first player's opening turn of a quiet-opening game: no attack, place and fortify only. */
export function attacksLocked(state: GameState): boolean {
  return state.turn === 1 && state.currentPlayer === state.firstPlayer && quietOpeningOn(state.config);
}

// ---------------------------------------------------------------------------
// v6: capitals (config.capitals)
// ---------------------------------------------------------------------------

/**
 * The capital a seat would get from the board as it stands: its territory with the most own neighbours, then
 * the most armies, then first in map order. No rng. Null when it holds nothing.
 */
export function pickCapital(state: GameState, player: PlayerId): TerritoryId | null {
  const m = mapOf(state);
  let best: TerritoryId | null = null;
  let bn = -1;
  let ba = -1;
  for (const t of m.territoryIds) {
    const x = state.territories[t];
    if (x.owner !== player) continue;
    let own = 0;
    for (const n of m.adjacency[t]) if (state.territories[n].owner === player) own++;
    if (own > bn || (own === bn && x.armies > ba)) {
      best = t;
      bn = own;
      ba = x.armies;
    }
  }
  return best;
}

/** Whose capital `t` is, or -1. */
export function capitalOf(state: GameState, t: TerritoryId): PlayerId {
  for (const p of state.players) if (p.capital === t) return p.id;
  return -1;
}

/** Every capital on the board and who holds it, in seat order. Empty without config.capitals. */
export function capitalHolders(state: GameState): { of: PlayerId; territory: TerritoryId; holder: PlayerId }[] {
  const out: { of: PlayerId; territory: TerritoryId; holder: PlayerId }[] = [];
  for (const p of state.players) if (p.capital) out.push({ of: p.id, territory: p.capital, holder: state.territories[p.capital].owner });
  return out;
}

/** With holdAllWins: the living seat that holds every capital, or -1. */
export function capitalsWinner(state: GameState): PlayerId {
  if (!state.config.capitals?.holdAllWins) return -1;
  const cs = capitalHolders(state);
  if (cs.length < 2) return -1;
  const h = cs[0].holder;
  if (h < 0 || state.players[h]?.eliminated || state.players[h]?.neutral) return -1;
  return cs.every((c) => c.holder === h) ? h : -1;
}

/** Attacker dice allowed from `from`: min(3, armies − 1), 0 if it can't attack. */
export function maxAttackDice(state: GameState, from: TerritoryId): 0 | 1 | 2 | 3 {
  const ts = state.territories[from];
  if (!ts) return 0;
  return Math.max(0, Math.min(3, ts.armies - 1)) as 0 | 1 | 2 | 3;
}

/** Defender dice: min(2, armies). Defender always rolls the max. */
export function defendDiceFor(armies: number): number {
  return Math.max(0, Math.min(2, armies));
}

/** Adjacent enemy territories `from` can attack (empty if `from` has < 2 armies). */
export function attackTargets(state: GameState, from: TerritoryId): TerritoryId[] {
  const ts = state.territories[from];
  if (!ts || ts.armies < 2 || ts.owner < 0) return [];
  return mapOf(state).adjacency[from].filter((n) => {
    const o = state.territories[n].owner;
    return o !== ts.owner && o >= 0;
  });
}

/** Owned territories with ≥ 2 armies and at least one adjacent enemy. */
export function attackSources(state: GameState, player: PlayerId): TerritoryId[] {
  const m = mapOf(state);
  const out: TerritoryId[] = [];
  for (const t of m.territoryIds) {
    const ts = state.territories[t];
    if (ts.owner !== player || ts.armies < 2) continue;
    if (m.adjacency[t].some((n) => state.territories[n].owner !== player && state.territories[n].owner >= 0)) out.push(t);
  }
  return out;
}

/** BFS over territories owned by `from`'s owner. Returns from → … → to (inclusive), or null. */
export function connectedPath(state: GameState, from: TerritoryId, to: TerritoryId): TerritoryId[] | null {
  const owner = state.territories[from]?.owner;
  if (owner === undefined || owner < 0 || !state.territories[to] || state.territories[to].owner !== owner) return null;
  if (from === to) return null;
  const adjacency = mapOf(state).adjacency;
  const prev = new Map<TerritoryId, TerritoryId | null>([[from, null]]);
  const queue: TerritoryId[] = [from];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    for (const n of adjacency[cur]) {
      if (prev.has(n) || state.territories[n].owner !== owner) continue;
      prev.set(n, cur);
      if (n === to) {
        const path: TerritoryId[] = [to];
        let p: TerritoryId | null = cur;
        while (p) {
          path.push(p);
          p = prev.get(p) ?? null;
        }
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

/** Territories of the same owner reachable from `from` through owned territories (excluding `from`). */
export function connectedOwned(state: GameState, from: TerritoryId): TerritoryId[] {
  const owner = state.territories[from]?.owner;
  if (owner === undefined || owner < 0) return [];
  const m = mapOf(state);
  const seen = new Set<TerritoryId>([from]);
  const queue: TerritoryId[] = [from];
  for (let qi = 0; qi < queue.length; qi++) {
    for (const n of m.adjacency[queue[qi]]) {
      if (seen.has(n) || state.territories[n].owner !== owner) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  seen.delete(from);
  return m.territoryIds.filter((t) => seen.has(t));
}

/** Fortify path under the game's fortifyRule ('adjacent' → [from, to] if neighbors). */
export function fortifyPath(state: GameState, from: TerritoryId, to: TerritoryId): TerritoryId[] | null {
  const a = state.territories[from];
  const b = state.territories[to];
  if (!a || !b || from === to || a.owner < 0 || a.owner !== b.owner) return null;
  if (state.config.fortifyRule === 'adjacent') return mapOf(state).adjacency[from].includes(to) ? [from, to] : null;
  return connectedPath(state, from, to);
}

/** Where `from` may fortify to under the fortifyRule (empty if `from` has < 2 armies). */
export function fortifyTargets(state: GameState, from: TerritoryId): TerritoryId[] {
  const a = state.territories[from];
  if (!a || a.armies < 2 || a.owner < 0) return [];
  if (state.config.fortifyRule === 'adjacent') {
    return mapOf(state).adjacency[from].filter((n) => state.territories[n].owner === a.owner);
  }
  return connectedOwned(state, from);
}

/** Owned territories with ≥ 2 armies and at least one owned neighbor (so a fortify target exists). */
export function fortifySources(state: GameState, player: PlayerId): TerritoryId[] {
  const m = mapOf(state);
  const out: TerritoryId[] = [];
  for (const t of m.territoryIds) {
    const ts = state.territories[t];
    if (ts.owner !== player || ts.armies < 2) continue;
    if (m.adjacency[t].some((n) => state.territories[n].owner === player)) out.push(t);
  }
  return out;
}

/** Territories needed to win: the game's dominationPercent of its board (targetTerritories). */
export function territoriesNeeded(state: GameState): number {
  return targetTerritories(mapOf(state), state.config.dominationPercent);
}

/** Seats still in the game. The 2-player neutral seat never counts (it can't win or keep a game going). */
export function alivePlayers(state: GameState): PlayerId[] {
  return state.players.filter((p) => !p.eliminated && !p.neutral).map((p) => p.id);
}

/**
 * Winner by territory count (domination / percent / last standing), or null.
 * Reason is 'domination' at 100% (or last player standing), 'percent' below that.
 */
export function checkWinner(
  state: GameState,
): { winner: PlayerId; reason: 'domination' | 'percent'; by?: 'capitals' } | null {
  const alive = alivePlayers(state);
  if (alive.length === 1) return { winner: alive[0], reason: 'domination' };
  const need = territoriesNeeded(state);
  const size = mapOf(state).size;
  for (const p of alive) {
    const n = territoryCount(state, p);
    if (n >= need) return { winner: p, reason: need >= size ? 'domination' : 'percent' };
  }
  // v6: holding every capital wins (config.capitals.holdAllWins).
  const cw = capitalsWinner(state);
  if (cw >= 0) return { winner: cw, reason: 'percent', by: 'capitals' };
  return null;
}

/** Turn-limit winner: most territories, then most armies, then lowest seat. */
export function turnLimitWinner(state: GameState): PlayerId {
  let best = -1;
  let bestT = -1;
  let bestA = -1;
  for (const p of alivePlayers(state)) {
    const t = territoryCount(state, p);
    const a = totalArmies(state, p);
    if (t > bestT || (t === bestT && a > bestA)) {
      best = p;
      bestT = t;
      bestA = a;
    }
  }
  return best;
}

/** Sum of enemy armies adjacent to `t` (from the owner's point of view). */
export function enemyNeighborArmies(state: GameState, t: TerritoryId): number {
  const owner = state.territories[t].owner;
  let s = 0;
  for (const n of mapOf(state).adjacency[t]) {
    const ns = state.territories[n];
    if (ns.owner !== owner && ns.owner >= 0) s += ns.armies;
  }
  return s;
}

/** True if `t` borders at least one territory owned by someone else. */
export function isBorder(state: GameState, t: TerritoryId): boolean {
  const owner = state.territories[t].owner;
  return mapOf(state).adjacency[t].some((n) => state.territories[n].owner !== owner && state.territories[n].owner >= 0);
}
