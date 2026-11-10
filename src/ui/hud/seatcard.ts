// The seat's card (v6, PLAN bet 4 "the seat strip explains itself"): what the marks under a seat ring mean, said
// in words. Type and one hairline on the paper, never a chip or a box: the seat's name in its pigment with its
// difficulty and personality, then territories, armies and cards, the continents it holds, its capital, how close
// it is to winning, its standing toward you, what it has taken from you, and for an AI you may ask, 'Click to ask
// for peace'. Your own seat shows your mission when missions are on.
//   Mouse: on hover (or keyboard focus) the card writes itself under the ring and dries when the pointer leaves.
//   Touch: a tap on a seat opens the same words as a small bottom sheet, with 'Ask Sage for peace' as a word to
//   press when it applies; a tap outside or a drag down puts it away.

import type { SeatChipVM, SeatRef } from '../../game/viewModel';
import { PLAYER_COLORS } from '../../shared/palette';
import { uiButton } from '../controls';
import { drawIn, EASE_IN_QUAD, emblem, h, minus, motion, setStyle, toggle } from '../dom';
import { layout } from '../layout';
import { dragToDismiss, grabHandle, sheetIn, sheetOut } from '../sheet';
import { seatX } from '../vmx';

const STANDING_LINE = { ally: 'Your ally', even: 'Even with you', wary: 'Wary of you', hostile: 'Hostile to you' } as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cap1 = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const andList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The card's lines for a seat, in reading order (each a class and its words). Pure: the gallery and tests can read it. */
export function seatCardLines(vm: SeatChipVM, continentName: (id: string) => string, touch: boolean): { cls: string; text: string }[] {
  const x = seatX(vm);
  const out: { cls: string; text: string }[] = [];
  if (vm.eliminated) {
    out.push({ cls: 'scd-facts', text: vm.out ? `Out · taken by ${vm.out.by.name} in round ${vm.out.round}` : 'Out of the game' });
    return out;
  }
  const facts = [plural(vm.territories, 'territory', 'territories')];
  if (vm.armies !== undefined) facts.push(plural(vm.armies, 'army', 'armies'));
  if (vm.cards !== undefined) facts.push(plural(vm.cards, 'card'));
  out.push({ cls: 'scd-facts num', text: facts.join(' · ') });
  const held = (vm.continents ?? []).map(continentName);
  if (held.length) out.push({ cls: 'scd-line', text: `Holds ${andList(held)}` });
  if (x.capital) out.push({ cls: 'scd-line', text: x.capital.held ? `Capital: ${x.capital.territory}` : `Lost its capital, ${x.capital.territory}` });
  if (x.threat) out.push({ cls: 'scd-threat num', text: cap1(minus(x.threat)) });
  if (vm.standing) out.push({ cls: 'scd-line', text: vm.standingReason ? minus(vm.standingReason) : STANDING_LINE[vm.standing] });
  const gt = vm.grudgeTicks ?? 0;
  if (gt > 0) out.push({ cls: 'scd-line', text: `Has taken ${plural(gt, 'territory', 'territories')} from you` });
  if (vm.grudge) out.push({ cls: 'scd-line', text: `Holds a grudge against ${vm.grudge.name}` });
  if (x.mission) out.push({ cls: 'scd-mission', text: `Your mission: ${minus(x.mission)}` });
  if (vm.canAskPeace && !touch) out.push({ cls: 'scd-act', text: 'Click to ask for peace' });
  return out;
}

/** The title row's quiet words after the name: 'Hard · Warlord', 'Neutral'. */
function kindWords(vm: SeatChipVM): string {
  const x = seatX(vm);
  if (vm.neutral) return 'Neutral armies';
  const w: string[] = [];
  if (vm.seat.kind === 'ai') w.push(x.difficulty ? `${x.difficulty} AI` : 'AI');
  if (vm.personality?.name) w.push(vm.personality.name);
  return w.join(' · ');
}

export class SeatCard {
  /** The hover card (desktop), on the paper under the ring. */
  readonly el: HTMLDivElement;
  /** The touch sheet and its scrim. */
  readonly scrim: HTMLDivElement;
  private sheet: HTMLDivElement;
  private sheetBody: HTMLDivElement;
  private askBtn: HTMLButtonElement;
  private seatId = -1;
  private sheetSeat: SeatChipVM | null = null;
  private hideT = 0;
  private out: Animation | null = null;
  /** The sheet's 'Ask Sage for peace' was pressed. */
  onAsk: ((seat: SeatRef) => void) | null = null;

  constructor(private continentName: (id: string) => string) {
    this.el = h('div', 'seat-card hidden');
    this.el.setAttribute('role', 'tooltip');
    this.el.dataset.testid = 'seat-card';
    this.scrim = h('div', 'seat-sheet-scrim hidden');
    this.sheet = h('div', 'sheet seat-sheet');
    this.sheet.dataset.testid = 'seat-sheet';
    this.sheetBody = h('div', 'seat-card in-sheet');
    this.askBtn = uiButton('Ask for peace', 'role-secondary seat-ask', () => {
      const s = this.sheetSeat;
      if (s) this.onAsk?.(s.seat);
      this.closeSheet();
    }, undefined, 'seat-sheet-ask');
    this.sheet.append(grabHandle(), this.sheetBody, this.askBtn);
    this.scrim.append(this.sheet);
    this.scrim.addEventListener('pointerdown', (e) => {
      if (e.target === this.scrim) {
        e.preventDefault();
        this.closeSheet();
      }
    });
    dragToDismiss(this.sheet, [this.sheet], { enabled: () => true, scrim: () => this.scrim, onDismiss: () => this.hideSheet() });
  }

  private fill(into: HTMLElement, vm: SeatChipVM, touch: boolean): void {
    into.textContent = '';
    const pal = PLAYER_COLORS[vm.seat.color];
    setStyle(into, '--seat-light', pal?.light ?? 'var(--ivory)');
    const head = h('div', 'scd-head');
    const name = h('span', 'scd-name', vm.seat.name);
    head.append(emblem(vm.seat.color, 'emb'), name);
    const kind = kindWords(vm);
    if (kind) head.append(h('span', 'scd-kind', kind));
    into.append(head, h('i', 'scd-rule'));
    for (const l of seatCardLines(vm, this.continentName, touch)) into.append(h('div', l.cls, l.text));
  }

  /** Desktop hover / focus: the card under the ring (`anchor`, the chip's box in client px). */
  show(vm: SeatChipVM, anchor: DOMRect): void {
    window.clearTimeout(this.hideT);
    this.out?.cancel();
    this.out = null;
    const fresh = vm.seat.id !== this.seatId || this.el.classList.contains('hidden');
    this.seatId = vm.seat.id;
    this.fill(this.el, vm, false);
    this.el.dataset.seat = String(vm.seat.id);
    toggle(this.el, 'hidden', false);
    const W = window.innerWidth;
    const w = this.el.offsetWidth;
    const left = Math.max(12, Math.min(anchor.left - 4, W - w - 12));
    this.el.style.left = `${Math.round(left)}px`;
    // Below the ring's marks (the card glyph row hangs under the ring, outside the chip's box).
    this.el.style.top = `${Math.round(anchor.bottom + parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.1)}px`;
    if (fresh && !motion.reduced) drawIn(this.el, 200);
  }

  /** Re-fill an open card when its seat's numbers change. */
  refresh(seats: SeatChipVM[]): void {
    if (!this.el.classList.contains('hidden')) {
      const vm = seats.find((c) => c.seat.id === this.seatId);
      if (vm) this.fill(this.el, vm, false);
    }
    if (this.sheetSeat) {
      const vm = seats.find((c) => c.seat.id === this.sheetSeat!.seat.id);
      if (vm && vm !== this.sheetSeat) this.paintSheet(vm);
    }
  }

  hide(now = false): void {
    window.clearTimeout(this.hideT);
    if (this.el.classList.contains('hidden')) return;
    const go = () => {
      if (motion.reduced || now || typeof this.el.animate !== 'function') {
        toggle(this.el, 'hidden', true);
        this.seatId = -1;
        return;
      }
      const a = (this.out = this.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: EASE_IN_QUAD, fill: 'forwards' }));
      a.onfinish = () => {
        if (this.out !== a) return;
        a.cancel();
        this.out = null;
        toggle(this.el, 'hidden', true);
        this.seatId = -1;
      };
    };
    if (now) go();
    else this.hideT = window.setTimeout(go, 140);
  }

  private paintSheet(vm: SeatChipVM): void {
    this.sheetSeat = vm;
    this.fill(this.sheetBody, vm, true);
    const ask = !!vm.canAskPeace && !vm.eliminated;
    toggle(this.askBtn, 'hidden', !ask);
    const label = this.askBtn.querySelector('.btn-label');
    if (label) label.textContent = `Ask ${vm.seat.name} for peace`;
  }

  /** Touch: the same words as a small bottom sheet. */
  openSheet(vm: SeatChipVM): void {
    this.paintSheet(vm);
    toggle(this.scrim, 'hidden', false);
    toggle(this.scrim, 'is-tablet', layout.form !== 'phone');
    sheetIn(this.sheet, this.scrim);
  }

  get sheetOpen(): boolean {
    return !!this.sheetSeat;
  }

  closeSheet(): void {
    if (!this.sheetSeat) return;
    sheetOut(this.sheet, this.scrim, () => this.hideSheet());
  }

  private hideSheet(): void {
    this.sheetSeat = null;
    toggle(this.scrim, 'hidden', true);
    this.sheet.style.transform = '';
    this.scrim.style.opacity = '';
  }
}
