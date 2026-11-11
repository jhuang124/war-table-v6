// The keys (v6): `?` lays one small paper sheet on the dimmed board listing what the keyboard does; `?` again,
// Esc or a click outside puts it away. UI-local (no controller state): it is a reference card, never a step.

import { uiButton } from '../controls';
import { h, motion, toggle } from '../dom';
import { sheetDrop } from '../sheet';

const KEYS: [string, string][] = [
  ['Enter  or  Space', 'Press the gold word: place, roll, move, go on'],
  ['←  →   or   −  +', 'Change the count'],
  ['1 – 9', 'Type the count'],
  ['U', 'Undo the last placement, until you roll'],
  ['Esc', 'Cancel what is picked; with nothing picked, the menu'],
  ['?', 'These keys'],
];

export class KeysSheet {
  readonly el: HTMLDivElement;
  private sheet: HTMLDivElement;
  private open = false;

  constructor() {
    this.el = h('div', 'scrim keys-scrim hidden');
    this.el.dataset.testid = 'keys';
    this.sheet = h('div', 'sheet keys-sheet');
    const head = h('div', 'sheet-head');
    head.append(h('h2', 'sheet-title', 'Keys'), uiButton('Close', 'role-exit', () => this.set(false), undefined, 'keys-close'));
    const list = h('dl', 'keys-list');
    for (const [k, what] of KEYS) list.append(h('dt', 'keys-k num', k), h('dd', 'keys-what', what));
    this.sheet.append(head, list);
    this.el.append(this.sheet);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.set(false);
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  set(on: boolean): void {
    if (on === this.open) return;
    this.open = on;
    toggle(this.el, 'hidden', !on);
    if (on && !motion.reduced) sheetDrop(this.sheet, this.el, 320);
  }
}
