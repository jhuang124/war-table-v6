// The bottom strip (docs/ROUND2.md §A–B): the Turn Track at the left, one line that says the one thing
// to do now, then the action zone (at most one count control and at most two buttons, one brass).
// Board clicks only select; buttons commit; the track is the only way to change phase (plus the
// fortify `Move N · end turn`, which says so). Pure: built from the displayed state + the selection.

import {
  attackSources as engineAttackSources,
  attacksLocked,
  OPENING_NO_ATTACK,
  mapDefOf,
  attackTargets,
  fortifySources,
  fortifyTargets,
  territoryCount,
  winProbability,
  type GameState,
  type TerritoryId,
} from '../engine';
import { Click, SEP, armies, cName, click, movesIn, pName, pct, poss, seatRef, tName } from './copy';
import { bestSet, oddsWord } from './helpers';
import type { ButtonId, ButtonVM, CountVM, StripVM, TrackSegId, TrackSegVM, TrackVM } from './viewModel';
import { PLAYER_COLORS } from '../shared/palette';

/**
 * Where `me` can attack from now: none on the quiet opening (v6, 2 players: the first player's opening turn is
 * place and fortify only, engine `attacksLocked`).
 */
export function attackSources(s: GameState, me: number): TerritoryId[] {
  return attacksLocked(s) ? [] : engineAttackSources(s, me);
}

/** v6: the quiet opening's line, said wherever the turn would otherwise point at Attack. */
export const QUIET_LINE = `No attacks on the opening turn${SEP}fortify or end your turn`;

/**
 * v6 "a person moves first": a human's first turn names their colour, so they know which ink is theirs.
 * 'You're Vermilion · place 3 armies'; a seat with its own name: 'John · you're Vermilion · place 3 armies'. On the
 * quiet opening it says so up front: '… · place 3 · no attacks this turn'.
 */
/** "You're Vermilion" (a seat named for its colour) or "John · you're Vermilion". */
export function youreLine(s: GameState, me: number): string {
  const p = s.players[me];
  const colour = (PLAYER_COLORS as Record<string, { name: string } | undefined>)[p.color]?.name ?? p.name;
  return p.name.trim().toLowerCase() === colour.toLowerCase() ? `You're ${colour}` : `${p.name}${SEP}you're ${colour}`;
}

export function firstTurnLine(s: GameState, me: number, remaining: number): string {
  const who = youreLine(s, me);
  return attacksLocked(s) ? `${who}${SEP}place ${remaining}${SEP}no attacks this turn` : `${who}${SEP}place ${armies(remaining)}`;
}

/** A human's very first turn of the game, before they have placed anything: round 1, a fresh Place step. */
export function isFirstTurn(s: GameState): boolean {
  const ph = s.phase;
  return s.round === 1 && ph.kind === 'reinforce' && !ph.midTurn && !Object.values(ph.placed).some((v) => (v ?? 0) > 0);
}

export interface Placement {
  t: TerritoryId;
  n: number;
}

export interface Sel {
  /** Place: the picked territory. Attack / fortify: the source. */
  selected: TerritoryId | null;
  /** Armed attack target / chosen fortify destination. */
  target: TerritoryId | null;
  /** Place count; null = all remaining. */
  placeCount: number | null;
  occupyCount: number | null;
  fortifyCount: number | null;
  /** The player moved the occupy / fortify count: the line shows the resulting totals. */
  countTouched?: boolean;
  /** Manual setup: armies staged locally this setup turn (committed on Done). */
  staged: Partial<Record<TerritoryId, number>>;
  /** Placements this step, newest last, for Undo (reinforce and setup). */
  placements: Placement[];
}

export function emptySel(): Sel {
  return { selected: null, target: null, placeCount: null, occupyCount: null, fortifyCount: null, staged: {}, placements: [] };
}

export function stagedTotal(sel: Sel): number {
  let n = 0;
  for (const v of Object.values(sel.staged)) n += v ?? 0;
  return n;
}

/** Armies still to place in this Place / setup step (0 outside them). */
export function placeLeft(s: GameState, sel: Sel): number {
  const ph = s.phase;
  if (ph.kind === 'setup-place') return Math.max(0, ph.toPlace - stagedTotal(sel));
  if (ph.kind === 'reinforce' && !ph.mustTrade) return ph.remaining;
  return 0;
}

/** The Place count's value: the picked count, clamped, or all remaining. */
export function placeValue(s: GameState, sel: Sel): number {
  const left = placeLeft(s, sel);
  return Math.max(1, Math.min(left, sel.placeCount ?? left));
}

/** The count control for a min…max range: a stepper for ≤ 6 options, a slider for more. */
export function countVM(value: number, min: number, max: number): CountVM {
  return { control: max - min + 1 <= 6 ? 'stepper' : 'slider', value, min, max };
}

/** Line while the opening deal plays (a random deal: nothing to click, a click only skips it). */
export function dealingLine(): string {
  return 'Dealing territories';
}

export function canFortifyAny(s: GameState): boolean {
  return fortifySources(s, s.currentPlayer).some((t) => fortifyTargets(s, t).length > 0);
}

// ---------------------------------------------------------------------------
// The Turn Track
// ---------------------------------------------------------------------------

const LABEL: Record<TrackSegId, string> = {
  place: 'Place',
  attack: 'Attack',
  fortify: 'Fortify',
  endTurn: 'End turn',
  setup: 'Setup',
  done: 'Done',
};
const TURN: TrackSegId[] = ['place', 'attack', 'fortify', 'endTurn'];

/** Why a track segment can't be reached now, or null if it can (or it isn't forward of the marker). */
export function trackLockReason(s: GameState, sel: Sel, seg: TrackSegId): string | null {
  const ph = s.phase;
  switch (ph.kind) {
    case 'setup-claim':
      return seg === 'done' ? `Claim a territory first${SEP}${click()} an open tile` : null;
    case 'setup-place': {
      if (seg !== 'done') return null;
      const left = placeLeft(s, sel);
      return left > 0 ? `Place your ${armies(left)} first` : null;
    }
    case 'reinforce':
      if (seg === 'place') return null;
      // v6: the quiet opening: Attack never opens this turn (the track goes Place → Fortify → End).
      if (seg === 'attack' && attacksLocked(s)) return OPENING_NO_ATTACK.replace(/\.$/, '');
      if (ph.mustTrade) return 'Trade cards first';
      return ph.remaining > 0 ? `Place your ${armies(ph.remaining)} first` : null;
    case 'occupy':
      return seg === 'fortify' || seg === 'endTurn' ? 'Finish moving armies in first' : null;
    default:
      return null;
  }
}

/** The segment the marker is on, for the phase on the board. */
function currentSeg(s: GameState): TrackSegId | null {
  switch (s.phase.kind) {
    case 'setup-claim':
    case 'setup-place':
      return 'setup';
    case 'reinforce':
      return 'place';
    case 'attack':
    case 'occupy':
      return 'attack';
    case 'fortify':
      return 'fortify';
    case 'game-over':
      return null;
  }
}

/** The recommended next step: all placed → Attack (End turn if nothing can attack); in Fortify → End turn. */
export function recommendedSeg(s: GameState, sel: Sel): TrackSegId | null {
  const ph = s.phase;
  const me = s.currentPlayer;
  switch (ph.kind) {
    case 'setup-place':
      return placeLeft(s, sel) === 0 ? 'done' : null;
    case 'reinforce':
      if (ph.mustTrade || ph.remaining > 0) return null;
      // v6: the quiet opening points past Attack: Fortify when a move is possible, else End turn.
      if (attacksLocked(s)) return canFortifyAny(s) ? 'fortify' : 'endTurn';
      return attackSources(s, me).length > 0 ? 'attack' : 'endTurn';
    case 'attack':
      if (attacksLocked(s)) return canFortifyAny(s) ? 'fortify' : 'endTurn';
      return attackSources(s, me).length === 0 ? 'endTurn' : null;
    case 'fortify':
      return 'endTurn';
    default:
      return null;
  }
}

export interface TrackInput {
  s: GameState;
  sel: Sel;
  /** The driver can click it. */
  live: boolean;
  /** A roll is playing. */
  rolling: boolean;
}

export function buildTrack(inp: TrackInput): TrackVM {
  const { s, sel } = inp;
  const me = s.currentPlayer;
  const seat = seatRef(s, me);
  const ph = s.phase;
  const setup = ph.kind === 'setup-claim' || ph.kind === 'setup-place';
  const ids: TrackSegId[] = setup ? ['setup', 'done'] : TURN;
  const cur = currentSeg(s);
  const at = cur ? ids.indexOf(cur) : ids.length;
  const segments: TrackSegVM[] = ids.map((id, i) => {
    let state: TrackSegVM['state'];
    if (i < at) state = 'done';
    else if (i === at) state = 'current';
    else state = trackLockReason(s, sel, id) ? 'locked' : 'eligible';
    return { id, label: LABEL[id], state };
  });
  const disabled = inp.live && (inp.rolling || ph.kind === 'occupy' || (ph.kind === 'reinforce' && ph.mustTrade));
  const recommended = inp.live && !disabled ? recommendedSeg(s, sel) : null;
  return {
    kind: setup ? 'setup' : 'turn',
    seat,
    segments,
    recommended,
    primary: false,
    live: inp.live,
    disabled,
    turnKey: `${s.turn}:${me}`,
  };
}

// ---------------------------------------------------------------------------
// The strip
// ---------------------------------------------------------------------------

export interface StripInput {
  s: GameState;
  sel: Sel;
  /** The driver may act (a human's own turn, no cover). */
  interactive: boolean;
  /** Watching line (AI turns). */
  narration: string | null;
  /** v5.1: the hand-off cover went (a line, not a window); always null, kept for older callers. */
  handoff?: number | null;
  /** Every human is out: offer to watch to the end or call it. */
  humansOut: boolean;
  /** Idle line (game over, etc.). */
  idleLine: string | null;
  rejection: { text: string; key: number } | null;
  showWinChance: boolean;
  lineKey: number;
  /** A roll is playing (the track is disabled). */
  rolling?: boolean;
  /** The board draws the resulting totals on the pieces itself: the line needn't. */
  boardPreview?: boolean;
  /**
   * A conquest is on screen but the selection that armed it hasn't caught up (the flood and march are
   * still playing): the line says what happened instead of describing a half-moved board.
   */
  took?: TerritoryId | null;
  /**
   * v4 (PLAN §3 A5): the engine moved the armies in itself after that conquest (no choice to make): the
   * line says how many ('You took Brazil · 3 armies move in'). null = a count was (or will be) chosen.
   */
  tookMoved?: number | null;
  /**
   * v6 (ux-desktop 8): the Place step closed but its last placement can still be taken back (nothing rolled yet):
   * Attack (and the quiet opening's Fortify) keeps a quiet Undo while nothing is picked.
   */
  canUndo?: boolean;
  /** v6 (fight copy): what the last roll of the armed fight cost, said in the line ('Lost 1 · 6 left'). */
  rollResult?: string | null;
  /** v6 (finding 13): the occupy line names what stays behind ('Ural keeps 4'). Absent = the bare 'Move into'. */
  occupyKeeps?: boolean;
}

const btn = (id: ButtonId, label: string, primary = false): ButtonVM => ({ id, label, primary });

/** The armed line's hard cap (docs/INK.md B2.11): a stake that doesn't fit is dropped, never truncated. */
export const ATTACK_LINE_MAX = 60;

/**
 * What taking `to` would mean, at most one stake, biggest first: 'knocks out Sam' (their last territory),
 * 'takes North America' (completes a continent), "breaks Sam's Asia" (ends their bonus). null = none.
 */
export function attackStake(s: GameState, from: TerritoryId, to: TerritoryId): string | null {
  const me = s.territories[from].owner;
  const them = s.territories[to].owner;
  if (me < 0 || them < 0 || me === them) return null;
  if (territoryCount(s, them) === 1) return `knocks out ${pName(s, them)}`;
  const m = mapDefOf(s.config);
  const c = m.territories[to].continent;
  const others = m.continents[c].territories.filter((t) => t !== to);
  if (others.every((t) => s.territories[t].owner === me)) return `takes ${cName(c, s)}`;
  if (others.every((t) => s.territories[t].owner === them)) return `breaks ${poss(pName(s, them))} ${cName(c, s)}`;
  return null;
}

/**
 * The armed line (docs/INK.md B2.11): 'Kamchatka → Alaska · 64% · likely', plus at most one stake
 * ('· takes North America', '· knocks out Sam'); '· likely' alone when the win chance is hidden. ≤ 60
 * characters: with long names the word gives way first (the number says it), then the stake.
 */
export function attackLine(s: GameState, from: TerritoryId, to: TerritoryId, showWinChance: boolean): string {
  const head = `${tName(from, s)} → ${tName(to, s)}`;
  const a = s.territories[from].armies;
  const d = s.territories[to].armies;
  if (a < 2 || d < 1) return head;
  const p = winProbability(a, d);
  const num = showWinChance ? `${head}${SEP}${pct(p)}%` : head;
  const odds = `${num}${SEP}${oddsWord(p)}`;
  const stake = attackStake(s, from, to);
  // Too long for everything: the stake outranks the word (the number already says the odds).
  const tries = stake ? [`${odds}${SEP}${stake}`, ...(showWinChance ? [`${num}${SEP}${stake}`] : []), odds, num] : [odds, num];
  return tries.find((x) => x.length <= ATTACK_LINE_MAX) ?? head;
}

/**
 * The armed line's tail after 'From → To' ('64% · likely', or with the stake), for the fight in the line
 * (StripVM.fight), where the names carry their counts. '' when the line is the two names alone.
 */
export function attackOdds(s: GameState, from: TerritoryId, to: TerritoryId, showWinChance: boolean): string {
  const head = `${tName(from, s)} → ${tName(to, s)}`;
  const line = attackLine(s, from, to, showWinChance);
  return line.startsWith(head + SEP) ? line.slice(head.length + SEP.length) : '';
}

/** 'You took Brazil', and when the engine moved the armies in itself, '· 3 armies move in'. */
export function tookLine(t: TerritoryId, moved: number | null): string {
  return moved ? `You took ${tName(t)}${SEP}${movesIn(moved)}` : `You took ${tName(t)}`;
}

/**
 * v6 (ux-desktop 7): what one roll did, from the attacker's side: 'Lost 1', 'They lost 2', 'Lost 1, they lost 1'.
 * null when nothing was lost (never happens in a legal roll).
 */
export function rollWords(attackerLost: number, defenderLost: number): string | null {
  if (attackerLost > 0 && defenderLost > 0) return `Lost ${attackerLost}, they lost ${defenderLost}`;
  if (attackerLost > 0) return `Lost ${attackerLost}`;
  if (defenderLost > 0) return `They lost ${defenderLost}`;
  return null;
}

/**
 * v6: the armed line after a roll that didn't decide it: 'Lost 1 · 6 left · 61% · likely'. The result leads; the
 * odds follow while they fit in the line's 60 characters (the word goes first, then the number).
 */
export function afterRollLine(result: string, s: GameState, from: TerritoryId, to: TerritoryId, showWinChance: boolean): string {
  const a = s.territories[from].armies;
  const d = s.territories[to].armies;
  const head = `${result}${SEP}${a} left`;
  if (a < 2 || d < 1) return head;
  const p = winProbability(a, d);
  const tries = showWinChance ? [`${head}${SEP}${pct(p)}%${SEP}${oddsWord(p)}`, `${head}${SEP}${pct(p)}%`] : [`${head}${SEP}${oddsWord(p)}`];
  return tries.find((x) => x.length <= ATTACK_LINE_MAX) ?? head;
}

/** v6: a capture's words: 'Egypt captured · cost 27' (the cost only when there was one). */
export function capturedWords(to: TerritoryId, cost: number): string {
  return cost > 0 ? `${tName(to)} captured${SEP}cost ${cost}` : `${tName(to)} captured`;
}

/** 'Ural 1 · Siberia 15': the two totals after moving `n` (the board-less preview). */
export function totalsLine(s: GameState, from: TerritoryId, to: TerritoryId, n: number): string {
  const a = s.territories[from].armies - n;
  const b = (s.territories[to].owner === s.territories[from].owner ? s.territories[to].armies : 0) + n;
  return `${tName(from, s)} ${a}${SEP}${tName(to, s)} ${b}`;
}

export function buildStrip(inp: StripInput): StripVM {
  const { s, sel } = inp;
  const me = s.currentPlayer;
  const accent = s.players[me].color;
  const track = buildTrack({ s, sel, live: inp.interactive, rolling: !!inp.rolling });
  const make = (mode: StripVM['mode'], line: string, extra: { count?: CountVM | null; buttons?: ButtonVM[] } = {}): StripVM => {
    const buttons = extra.buttons ?? [];
    return {
      mode,
      track: { ...track, primary: !!track.recommended && !buttons.some((b) => b.primary) },
      accent,
      line: inp.rejection ? inp.rejection.text : line,
      lineKind: inp.rejection ? 'rejection' : 'normal',
      lineKey: inp.rejection ? inp.rejection.key : inp.lineKey,
      count: extra.count ?? null,
      buttons,
    };
  };

  if (!inp.interactive) {
    if (inp.humansOut) {
      return {
        mode: 'watching',
        track,
        accent,
        line: 'All humans are out',
        lineKind: 'normal',
        lineKey: inp.lineKey,
        count: null,
        buttons: [btn('callGame', 'End game'), btn('watchAis', 'Watch to the end', true)],
      };
    }
    const line = inp.narration ?? inp.idleLine ?? `${poss(pName(s, me))} turn`;
    return {
      mode: inp.idleLine && !inp.narration ? 'idle' : 'watching',
      track,
      accent,
      line,
      lineKind: inp.narration ? 'narration' : 'normal',
      lineKey: inp.lineKey,
      count: null,
      buttons: [],
    };
  }

  const ph = s.phase;
  switch (ph.kind) {
    case 'setup-claim':
      if (s.config.setupMode !== 'draft') return make('setup', dealingLine());
      return make('setup', `Claim a territory${SEP}${click()} an open tile`);
    case 'setup-place': {
      const staged = stagedTotal(sel);
      const left = Math.max(0, ph.toPlace - staged);
      const undo = sel.placements.length > 0 ? [btn('undo', 'Undo')] : [];
      if (left === 0) return make('setup', `All ${ph.toPlace} placed${SEP}${click()} Done`, { buttons: undo });
      if (sel.selected && s.territories[sel.selected].owner === me) {
        const n = placeValue(s, sel);
        return make('setup', `Place on ${tName(sel.selected)}`, {
          count: countVM(n, 1, left),
          buttons: [...undo, btn('place', `Place ${n}`, true)],
        });
      }
      const line = staged > 0 ? `Place ${left} more${SEP}${click()} a territory` : `Place ${armies(left)}${SEP}${click()} a territory`;
      return make('setup', line, { buttons: undo });
    }
    case 'reinforce': {
      const hand = s.players[me].cards;
      const best = bestSet(s, me);
      if (ph.mustTrade) {
        return make('place', `Trade cards first${SEP}you hold ${hand.length}`, {
          buttons: best ? [btn('trade', `Trade cards +${best.value}`, true)] : [],
        });
      }
      const placedAny = Object.values(ph.placed).some((v) => (v ?? 0) > 0);
      const undo = placedAny ? btn('undo', 'Undo') : null;
      const cards = hand.length > 0 ? btn('cards', `Cards ${hand.length}`) : null;
      const secondaries = [...(cards ? [cards] : []), ...(undo ? [undo] : [])];
      if (ph.remaining === 0) {
        if (attacksLocked(s)) return make('place', QUIET_LINE, { buttons: secondaries });
        const next = attackSources(s, me).length > 0 ? (ph.midTurn ? 'keep attacking' : 'Attack is next') : 'end your turn';
        return make('place', `All placed${SEP}${next}`, { buttons: secondaries });
      }
      if (sel.selected && s.territories[sel.selected].owner === me) {
        const n = placeValue(s, sel);
        const second = undo ?? cards;
        return make('place', `Place on ${tName(sel.selected)}`, {
          count: countVM(n, 1, ph.remaining),
          buttons: [...(second ? [second] : []), btn('place', `Place ${n}`, true)],
        });
      }
      const line = placedAny
        ? `Place ${ph.remaining} more${SEP}${click()} a territory`
        : isFirstTurn(s)
          ? firstTurnLine(s, me, ph.remaining)
          : `Place ${armies(ph.remaining)}${SEP}${click()} a territory`;
      return make('place', line, { buttons: secondaries });
    }
    case 'attack': {
      if (inp.took && s.territories[inp.took].owner === me) return make('attack', tookLine(inp.took, inp.tookMoved ?? null));
      const armed = sel.selected && sel.target && s.territories[sel.selected].owner === me && s.territories[sel.target].owner !== me;
      if (armed) {
        const al = attackLine(s, sel.selected!, sel.target!, inp.showWinChance);
        return make('attack', inp.rollResult ? afterRollLine(inp.rollResult, s, sel.selected!, sel.target!, inp.showWinChance) : al, {
          buttons: [btn('roll', 'Roll'), btn('blitz', 'Blitz', true)],
        });
      }
      const undoA = inp.canUndo ? { buttons: [btn('undo', 'Undo')] } : {};
      if (attacksLocked(s)) return make('attack', QUIET_LINE, undoA);
      if (sel.selected && s.territories[sel.selected].owner === me) return make('attack', `Attack from ${tName(sel.selected)}${SEP}${click()} an enemy`, undoA);
      if (attackSources(s, me).length === 0) return make('attack', `No attacks left${SEP}end your turn`, undoA);
      return make('attack', `${Click()} an enemy territory to attack`, undoA);
    }
    case 'occupy': {
      const value = Math.min(ph.max, Math.max(ph.min, sel.occupyCount ?? ph.max));
      const keeps = s.territories[ph.from].armies - value;
      const line =
        sel.countTouched && !inp.boardPreview
          ? totalsLine(s, ph.from, ph.to, value)
          : inp.occupyKeeps
            ? `Move into ${tName(ph.to)}${SEP}${tName(ph.from)} keeps ${keeps}`
            : `Move into ${tName(ph.to)}`;
      // v5.1 E2: all but one is decided for you; the control unfolds only once the player touches the count.
      return make('occupy', line, {
        count: ph.max > ph.min ? { ...countVM(value, ph.min, ph.max), ...(sel.countTouched ? {} : { collapsed: true }) } : null,
        buttons: [btn('move', `Move ${value}`, true)],
      });
    }
    case 'fortify': {
      if (sel.selected && sel.target && s.territories[sel.selected].owner === me) {
        const max = Math.max(1, s.territories[sel.selected].armies - 1);
        const value = Math.min(max, Math.max(1, sel.fortifyCount ?? max));
        const line = sel.countTouched && !inp.boardPreview ? totalsLine(s, sel.selected, sel.target, value) : `Move from ${tName(sel.selected)} to ${tName(sel.target)}`;
        return make('fortify', line, {
          count: max > 1 ? countVM(value, 1, max) : null,
          buttons: [btn('move', `Move ${value}${SEP}end turn`, true)],
        });
      }
      if (sel.selected && s.territories[sel.selected].owner === me) return make('fortify', `Move from ${tName(sel.selected)}${SEP}${click()} where to`);
      const undoF = inp.canUndo ? { buttons: [btn('undo', 'Undo')] } : {};
      if (!canFortifyAny(s)) return make('fortify', `Nothing to move${SEP}end your turn`, undoF);
      return make('fortify', 'Move armies once, or end your turn', undoF);
    }
    case 'game-over':
      return {
        mode: 'idle',
        track,
        accent,
        line: inp.idleLine ?? 'The game is over',
        lineKind: 'normal',
        lineKey: inp.lineKey,
        count: null,
        buttons: [],
      };
  }
}

/** Territories to pulse for the current selection (exported for highlights). */
export function selectionTargets(s: GameState, sel: Sel): TerritoryId[] {
  if (!sel.selected) return [];
  if (s.phase.kind === 'attack') return attackTargets(s, sel.selected);
  if (s.phase.kind === 'fortify') return fortifyTargets(s, sel.selected);
  return [];
}
