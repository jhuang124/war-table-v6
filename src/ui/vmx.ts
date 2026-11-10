// v6 HUD: optional view-model fields the UI renders when present and ignores when absent. They are not in
// src/game/viewModel.ts yet (the UI builder does not own it): the integrator adds each one there with the same
// shape, and the casts below become plain property reads. Every field is optional, so nothing breaks first.

import type { NameCardVM, NewGameVM, SeatChipVM, VictoryVM } from '../game/viewModel';

/** Seat strip (v6): the seat's own card says these in words. */
export interface SeatChipX {
  /**
   * How close this seat is to winning, one plain line, only when it is worth saying ('needs 8 · holds a set worth
   * 30'). Shown on the seat's card, and quietly under its name on the strip while it is set.
   */
  threat?: string | null;
  /** v6 capitals: the seat's capital and whether it still holds it. Absent / null = capitals off. */
  capital?: { territory: string; held: boolean } | null;
  /** An AI seat's difficulty as a word ('Easy' / 'Normal' / 'Hard'). Absent for humans. */
  difficulty?: string | null;
  /**
   * The seat's secret mission, one plain line ('Hold Asia and Africa'), sent only on the seat it belongs to and only
   * while the reader may see it (that human's own turn). Absent = missions off, or not yours to see.
   */
  mission?: string | null;
}
export type SeatChipVMx = SeatChipVM & SeatChipX;
export const seatX = (c: SeatChipVM): SeatChipVMx => c as SeatChipVMx;

/** Victory (v6): honest copy for a game that was called before anyone won ('Called in round 14 · Ochre led on territories'). */
export interface VictoryX {
  called?: string | null;
}
export type VictoryVMx = VictoryVM & VictoryX;
export const victoryX = (v: VictoryVM): VictoryVMx => v as VictoryVMx;

/** New game (v6): a length that lives under More (Full conquest). */
export type LengthOptionX = NewGameVM['lengthOptions'][number] & { advanced?: boolean };

/** Territory note (v6): the territory's box on screen (client px), so the note sits beside it, never on it. */
export type NameCardVMx = NameCardVM & { rect?: { x: number; y: number; w: number; h: number } | null };
