// Phone-only HUD pieces (docs/MOBILE.md §1, §3):
//   RotatePill — the one-time `Rotate for the full map` line on a portrait phone, in the dock's line
//                slot; it dries after 4 s, at the first touch, or on rotating; never shown again.
//   NameCard   — the territory's facts as a margin note (fight text, John 2026-10-05: "the name card
//                becomes a margin note, for good"): name, its stone's history ('Siberia · 4 · held since
//                the deal'), continent + bonus, owner, armies. v6: on desktop it rides beside the pointer (the
//                audit found it ~700 px away in the top-left, over Alaska), never on the territory it
//                describes (hover / select); touch = the dock's
//                line slot above the rule, two lines at most (long-press; release dries it). Serif words
//                on the paper, no box, no background; it writes and dries like the one line. Driven by
//                GameVM.nameCard (the controller never sends one while a fight is armed or its ring is up).

import type { NameCardVM } from '../../game/viewModel';
import type { NameCardVMx } from '../vmx';
import { PLAYER_COLORS } from '../../shared/palette';
import { drawIn, EASE_IN_QUAD, emblem, h, minus, motion, setStyle, setText, toggle } from '../dom';
import { layout, onLayout } from '../layout';
import { STORAGE_KEYS } from '../../shared/keys';

/** Desktop: the note holds this long after the pointer leaves the land (crossing a strait never blinks it). */
const DESK_HOLD_MS = 700;
const DESK_DRY_MS = 360;
const SLOT_DRY_MS = 120;

const ROTATE_KEY = STORAGE_KEYS.rotateHint;

function seen(): boolean {
  try {
    return localStorage.getItem(ROTATE_KEY) === '1';
  } catch {
    return false;
  }
}
function markSeen(): void {
  try {
    localStorage.setItem(ROTATE_KEY, '1');
  } catch {
    /* private mode: shows again next time, which is fine */
  }
}

/** The hint waits this long after the slot is claimed, so whatever was on the line has dried first. */
const HINT_ENTER_MS = 320;
/** It dries by itself after this long on the paper (or at the first touch). */
const HINT_HOLD_MS = 4000;

/**
 * The one-time rotate hint (INK F3): one serif line on the paper in the dock's line slot, never a pill
 * over the board. Shown once per device, on the first portrait game screen that has nothing else to
 * say (no turn line, roll, hand-off, sheet or victory); it dries out after 4 s, at the first touch, or
 * when any of those arrive. No ×: drying is the dismissal.
 */
export class RotatePill {
  readonly el: HTMLDivElement;
  private text: HTMLSpanElement;
  private shown = false;
  private timer = 0;
  private enterT = 0;
  private out: Animation | null = null;
  /** True while the hint owns the line slot (the strip's own line steps aside). */
  onShow: ((on: boolean) => void) | null = null;
  private onTouch = () => this.dismiss();

  constructor() {
    this.el = h('div', 'rotate-hint hidden');
    this.el.setAttribute('role', 'status');
    this.el.dataset.testid = 'rotate-pill';
    this.text = h('span', 'rh-text', 'Rotate for the full map');
    this.el.append(this.text);
  }

  /** Something (the hint or a drying hint) is in the line slot. */
  get busy(): boolean {
    return this.shown || this.out?.playState === 'running';
  }

  /**
   * Call on every render. `quiet`: the game screen with nothing else happening in the slot or on the
   * board; `phonePortrait`: the layout. Anything else arriving dries the hint.
   */
  update(quiet: boolean, phonePortrait: boolean): void {
    if (this.shown) {
      if (!quiet || !phonePortrait) this.dismiss();
      return;
    }
    if (!quiet || !phonePortrait || seen()) return;
    this.shown = true;
    markSeen();
    // Claim the slot now (the strip's line dries, 160 ms); brush in once it has gone.
    this.onShow?.(true);
    this.out?.cancel();
    this.out = null;
    this.el.classList.remove('hidden');
    this.text.style.opacity = '0';
    window.clearTimeout(this.enterT);
    this.enterT = window.setTimeout(() => {
      if (!this.shown) return;
      this.text.style.opacity = '';
      drawIn(this.text, 300);
      this.timer = window.setTimeout(() => this.dismiss(), HINT_HOLD_MS);
      window.addEventListener('pointerdown', this.onTouch, { capture: true, passive: true });
    }, motion.reduced ? 0 : HINT_ENTER_MS);
  }

  dismiss(): void {
    if (!this.shown) return;
    this.shown = false;
    window.clearTimeout(this.timer);
    window.clearTimeout(this.enterT);
    window.removeEventListener('pointerdown', this.onTouch, { capture: true });
    const done = () => {
      this.el.classList.add('hidden');
      this.text.style.opacity = '';
      this.onShow?.(false);
    };
    if (motion.reduced || this.text.style.opacity === '0' || typeof this.el.animate !== 'function') return done();
    // It dries (easeInQuad), then the strip's line comes back.
    const a = (this.out = this.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: EASE_IN_QUAD, fill: 'forwards' }));
    a.onfinish = () => {
      if (this.shown) return;
      a.cancel();
      done();
    };
  }
}

export class NameCard {
  readonly el: HTMLDivElement;
  private title: HTMLDivElement;
  private hist: HTMLDivElement;
  private cont: HTMLDivElement;
  private owner: HTMLDivElement;
  private ownerName: HTMLSpanElement;
  private emb: HTMLSpanElement;
  private armies: HTMLSpanElement;
  /** The note on the paper (its key), or -1 when none / drying. */
  private key = -1;
  private holdT = 0;
  private out: Animation | null = null;
  /** Touch: the note writes in the dock's line slot; desktop: the left margin. */
  private slot = false;
  /** Touch: the note owns the line slot (true at once) / gave it back (false once dried). */
  onShow: ((on: boolean) => void) | null = null;
  /** v6 desktop: the pointer (client px) and the territory's box, so the note rides beside the pointer. */
  private px = -1;
  private py = -1;
  private rect: { x: number; y: number; w: number; h: number } | null = null;
  private placeQueued = false;

  constructor() {
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        this.px = e.clientX;
        this.py = e.clientY;
        if (this.key !== -1 && !this.slot && !this.placeQueued) {
          this.placeQueued = true;
          requestAnimationFrame(() => {
            this.placeQueued = false;
            this.place();
          });
        }
      },
      { passive: true },
    );
    this.el = h('div', 'name-card hidden');
    this.el.setAttribute('role', 'note');
    this.title = h('div', 'nc-title');
    this.hist = h('div', 'nc-hist num hidden');
    this.hist.dataset.testid = 'name-card-history';
    this.cont = h('div', 'nc-cont num');
    this.owner = h('div', 'nc-owner');
    this.emb = h('span', 'nc-emb');
    this.ownerName = h('span', 'nc-name');
    this.armies = h('span', 'nc-armies num');
    this.owner.append(this.emb, this.ownerName, ' ', this.armies);
    this.el.append(this.title, this.hist, this.cont, this.owner);
  }

  /** Where the note writes: the HUD's left margin (desktop) or the dock's line slot (touch); follows the layout. */
  home(margin: HTMLElement, slot: HTMLElement): void {
    const go = () => {
      const inSlot = layout.touch;
      if (inSlot !== this.slot && this.key !== -1) this.dry(true);
      this.slot = inSlot;
      const parent = inSlot ? slot : margin;
      if (this.el.parentElement !== parent) parent.append(this.el);
      toggle(this.el, 'in-slot', inSlot);
      toggle(this.el, 'in-margin', !inSlot);
      // The stone's history is the second row in the margin, the second line in the slot (after the facts).
      if (inSlot) this.el.append(this.hist);
      else this.el.insertBefore(this.hist, this.cont);
    };
    go();
    onLayout(go);
  }

  /** Something (the note, or the note drying) is in the line slot (touch). */
  get busy(): boolean {
    return this.slot && (this.key !== -1 || this.out?.playState === 'running');
  }

  /** It dries (the line's easeInQuad); `now` = gone at once (a fight arming, a layout change). */
  private dry(now = false): void {
    window.clearTimeout(this.holdT);
    this.holdT = 0;
    if (this.key === -1) return;
    this.key = -1;
    delete this.el.dataset.testid;
    const done = () => {
      if (this.key !== -1) return;
      this.el.classList.add('hidden');
      if (this.slot) this.onShow?.(false);
    };
    this.out?.cancel();
    this.out = null;
    if (now || motion.reduced || typeof this.el.animate !== 'function') return done();
    const a = (this.out = this.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: this.slot ? SLOT_DRY_MS : DESK_DRY_MS, easing: EASE_IN_QUAD, fill: 'forwards' }));
    a.onfinish = () => {
      if (this.out === a) this.out = null;
      a.cancel();
      done();
    };
  }

  /**
   * v6 desktop: the note rides beside the pointer. With the territory's box it sits just outside the box (to the
   * right, or the left when there is no room), level with the pointer; without it, above and to the right of the
   * pointer (below when there is no room above). Kept clear of the seat strip and the dock, inside the screen.
   */
  private place(): void {
    if (this.slot || this.key === -1) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const w = this.el.offsetWidth || 240;
    const hgt = this.el.offsetHeight || 90;
    const topMin = (document.querySelector('.topstrip')?.getBoundingClientRect().bottom ?? 0) + 12;
    const dock = document.querySelector('.strip')?.getBoundingClientRect().top ?? H;
    const botMax = dock - 12;
    const gap = 22;
    let x: number;
    let y: number;
    const r = this.rect;
    if (r) {
      x = r.x + r.w + gap + w <= W - 12 ? r.x + r.w + gap : r.x - gap - w;
      y = this.py - hgt / 2;
      if (x < 12) {
        // Neither side has room: above or below the box.
        x = this.px - w / 2;
        y = r.y - gap - hgt >= topMin ? r.y - gap - hgt : r.y + r.h + gap;
      }
    } else {
      x = this.px + gap;
      if (x + w > W - 12) x = this.px - gap - w;
      y = this.py - gap - hgt;
      if (y < topMin) y = this.py + gap + 6;
    }
    x = Math.max(12, Math.min(x, W - w - 12));
    y = Math.max(topMin, Math.min(y, botMax - hgt));
    this.el.style.left = `${Math.round(x)}px`;
    this.el.style.top = `${Math.round(y)}px`;
  }

  /** `now`: put it away at once (a fight is on: the note never shares the screen with it). */
  update(vm: NameCardVM | null | undefined, now = false): void {
    if (!vm) {
      if (this.key === -1) return;
      if (now || this.slot) return this.dry(now);
      // Desktop: the pointer left the land; the note holds a moment, then dries.
      if (!this.holdT) this.holdT = window.setTimeout(() => this.dry(), motion.reduced ? 0 : DESK_HOLD_MS);
      return;
    }
    window.clearTimeout(this.holdT);
    this.holdT = 0;
    const wasOn = this.key !== -1;
    const fresh = vm.key !== this.key;
    this.key = vm.key;
    if (this.out) {
      this.out.cancel();
      this.out = null;
    }
    this.el.dataset.testid = 'name-card';
    setText(this.title, vm.territory);
    // The stone's history without the name and count the note already carries ('Ural · 19 · held since round 3 ·
    // taken from Sage' → 'Held since round 3 · taken from Sage').
    let hist = vm.history ? minus(vm.history) : '';
    if (hist.startsWith(`${vm.territory} · `)) hist = hist.slice(vm.territory.length + 3).replace(/^[\d\u2212-]+ · /, '');
    if (hist) hist = hist[0].toUpperCase() + hist.slice(1);
    toggle(this.hist, 'hidden', !hist);
    if (hist !== this.hist.textContent) setText(this.hist, hist);
    setText(this.cont, `${vm.continent} +${vm.bonus}`);
    this.emb.textContent = '';
    if (vm.owner) this.emb.append(emblem(vm.owner.color));
    setText(this.ownerName, vm.owner ? vm.owner.name : 'Unclaimed');
    setText(this.armies, vm.armies === 1 ? '1 army' : `${vm.armies} armies`);
    setStyle(this.el, '--seat', vm.owner ? PLAYER_COLORS[vm.owner.color].light : 'var(--ivory-78)');
    const hidden = this.el.classList.contains('hidden');
    this.el.classList.remove('hidden');
    if (!this.slot) {
      // v6: beside the pointer, never on the territory it describes (its box when the controller sends it).
      this.rect = (vm as NameCardVMx).rect ?? null;
      if (this.px < 0) {
        this.px = vm.x;
        this.py = vm.y;
      }
      this.place();
    } else if (!wasOn) this.onShow?.(true);
    // It writes in when it arrives on bare paper; moving from one territory to the next rewrites in place.
    if (fresh && (!wasOn || hidden) && !motion.reduced) drawIn(this.el, 220, this.slot ? 120 : 0);
  }
}

const HOME_KEY = STORAGE_KEYS.homeHint;

/** Installed (Home Screen / app window): there is nothing to suggest. */
function standalone(): boolean {
  try {
    return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/**
 * v6: on a phone in a browser tab, one plain line on the title, once per device: the browser's bars cost the
 * board a fifth of a landscape screen. It dries after 8 s or at the first touch, and is never shown again.
 */
export class HomeHint {
  readonly el: HTMLDivElement;
  private shown = false;
  private timer = 0;
  private onTouch = () => this.dismiss();

  constructor() {
    this.el = h('div', 'home-hint hidden');
    this.el.setAttribute('role', 'status');
    this.el.dataset.testid = 'home-hint';
    const ios = /iP(hone|od|ad)/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.el.append(h('span', 'hh-text', ios ? 'For the full screen: Share, then Add to Home Screen' : 'For the full screen: add War Table to your Home Screen'));
  }

  /** Call on every render; `force` shows it regardless (the gallery). */
  update(onTitle: boolean, force = false): void {
    if (this.shown) {
      if (!onTitle) this.dismiss();
      return;
    }
    if (!force) {
      if (!onTitle || layout.form !== 'phone' || standalone()) return;
      try {
        if (localStorage.getItem(HOME_KEY) === '1') return;
        localStorage.setItem(HOME_KEY, '1');
      } catch {
        return;
      }
    }
    this.shown = true;
    this.el.classList.remove('hidden');
    drawIn(this.el, 320, 900);
    this.timer = window.setTimeout(() => this.dismiss(), 8000);
    window.setTimeout(() => window.addEventListener('pointerdown', this.onTouch, { capture: true, passive: true }), 400);
  }

  dismiss(): void {
    if (!this.shown) return;
    this.shown = false;
    window.clearTimeout(this.timer);
    window.removeEventListener('pointerdown', this.onTouch, { capture: true });
    if (motion.reduced || typeof this.el.animate !== 'function') return void this.el.classList.add('hidden');
    const a = this.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: EASE_IN_QUAD, fill: 'forwards' });
    a.onfinish = () => {
      this.el.classList.add('hidden');
      a.cancel();
    };
  }
}
