// Effective UI scale (UX.md §10.3). Pure: no DOM, safe for the controller and the renderer to import.
//
// The HUD is laid out for a CSS viewport of at least 1280×720 at scale 1.0. A text size only applies as
// far as the screen has room for it, so TV (1.5) is exact on 1920×1080, fitted to 1.125 on a 1440×900
// mirror and to 1.0 on 1280×800, where the full 1.5 would pile the top bar, roster and badges into
// each other. Laptop is never scaled down.

import type { TextSize } from '../game/viewModel';

export const TEXT_SCALE: Record<TextSize, number> = { laptop: 1, couch: 1.25, tv: 1.5 };

/** The CSS viewport the HUD needs at scale 1.0. */
export const BASE_VIEWPORT = { width: 1280, height: 720 } as const;

/**
 * Phones (docs/MOBILE.md §6): the phone layout is built for scale 1.0 at 390 px, so the desktop fit rule
 * (which would pin every size to 1.0) doesn't apply; the setting still works, in smaller steps.
 */
export const PHONE_TEXT_SCALE: Record<TextSize, number> = { laptop: 1, couch: 1.1, tv: 1.2 };

/** A phone-sized viewport (either orientation). Mirrors src/ui/layout.ts without the pointer check. */
export function isPhoneViewport(width: number, height: number): boolean {
  return Math.min(width, height) <= 540 && Math.max(width, height) <= 1000;
}

/**
 * v6 (readable from the couch): the HUD grows with the screen instead of staying a 1280 laptop UI. At 'laptop' it
 * takes half the room beyond 1280×720 (1440×900 → 1.06, 1920×1080 → 1.25, 2560×1440 → 1.5); 'couch' and 'tv'
 * multiply that, fitted so the strips never pile into each other (at most 1.15× the room: TV on 1920×1080 is
 * 1.725, on 1440×900 1.29). Nothing ever shrinks below 1.
 */
export function effectiveUiScale(size: TextSize, width: number, height: number): number {
  if (isPhoneViewport(width, height)) return PHONE_TEXT_SCALE[size] ?? 1;
  const nominal = TEXT_SCALE[size] ?? 1;
  const room = Math.max(1, Math.min(width / BASE_VIEWPORT.width, height / BASE_VIEWPORT.height));
  const grow = 1 + (room - 1) * 0.5;
  const fit = Math.max(grow, room * 1.15);
  return Math.round(Math.max(1, Math.min(nominal * grow, fit)) * 1000) / 1000;
}

/** True when the screen is too small for the chosen size and it was fitted down. */
export function isFitted(size: TextSize, width: number, height: number): boolean {
  if (isPhoneViewport(width, height)) return false;
  const room = Math.max(1, Math.min(width / BASE_VIEWPORT.width, height / BASE_VIEWPORT.height));
  return effectiveUiScale(size, width, height) < (TEXT_SCALE[size] ?? 1) * (1 + (room - 1) * 0.5) - 1e-3;
}
