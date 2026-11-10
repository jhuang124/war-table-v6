# v6 audit: phone and tablet (touch, small screens, PWA, orientation)

Auditor lane: mobile. Branch v6 (= shipped v5). Date 2026-11-10.
Method: Playwright Chromium (GPU flags, muted) with device-emulated contexts (`hasTouch`, `isMobile`, DPR 2–3,
CDP safe-area insets), real touch events (`touchscreen.tap`, CDP `Input.dispatchTouchEvent` for drag / pinch /
long-press). Dev server on :5302; a production build served on :5312 for the PWA/offline check.
Scripts and every screenshot: `artifacts/v6-audit/mobile/` (`common.ts`, `shell.ts`, `turn.ts`, `sheets.ts`,
`pwa.ts`, `extra.ts`, `hit.ts`; logs `shell.log`, `turn-all.log`, `sheets2.log`).

Viewports: iPhone portrait 390×844 @3 (Safari, no insets) and as an installed PWA (insets 47/34), iPhone
landscape 844×390 @3 (insets 47 L/R, 21 bottom), Safari-with-bars 390×664 and 844×340, small Android 360×740 @3,
iPad 820×1180 @2 and 1180×820.

**Verified by playing** = I drove it with touch and looked at the screenshot. **Inferred from code** = read, not
reproduced on a device. Chromium stands in for iOS Safari: anything iOS-specific (haptics, splash, bar collapse)
is inferred.

---

## Ranked findings

### 1. P1 · Land under the finger always wins; tolerance only helps over water (fat-finger mis-picks)
- Verified: exact hit region per territory measured by sampling the real touch picker
  (`__board.__debug.touchPick`) on a 3–4 px grid; reported as √area (the side of an equivalent square).
  - iPhone landscape (the documented primary phone layout): **33 of 42 territories under 44 px**; smallest
    Irkutsk 23, Madagascar 23, Iceland 26, Afghanistan 26, E. Australia 26, India 28 (`hit.ts`).
  - Safari landscape with the bars showing (844×340, the realistic first visit): **38 of 42 under 44 px**,
    smallest 20 px.
  - Fat-finger test (9 taps at ±9 px around each piece, a normal thumb error): landscape phone picks the
    wrong territory on Southern Europe 3/9, Egypt 3/9, Japan 3/9 (→ nothing), Middle East 2/9, Central
    America 2/9 (→ Eastern/Western US), Indonesia 2/9 (→ Siam) (`turn-all.log`, `[iphone-l] fat finger`).
    iPad landscape: 9/9 everywhere. Portrait phone: 9/9 for the territories that are on screen.
- Cause: `touchPick` returns the exact tile under the finger first; the 22 px nearest-selectable search only
  runs when the finger is on open water (`src/render/index.ts:1032-1055`). So a tap 6 px into an
  *unselectable* neighbour picks the neighbour, even when the only legal target is the one you obviously meant.
- Fix (M, `src/render/index.ts` touchPick): on touch, score candidates inside a ~22 px radius by
  `distance − bonus(selectable / legal target for the armed source)`; prefer a legal target over an exact
  but illegal tile. Also treat the plaque + figure as a fat hit (≥ 44 px circle). Add a "magnifier" or
  name-under-finger preview on press (the pressed tile already shows its name) so the lift confirms.

### 2. P1 · Drag on your own land never pans in Attack; it draws a stroke (gesture conflict)
- Verified on every device: in Attack, a 130 px one-finger drag that starts on Ural (an eligible source)
  produced no pan (`viewMoved false → false`) and armed nothing; a drag starting on water panned
  (`turn-all.log`, "drag from Ural in attack"). Screenshot: `iphone-p-13-drag-from-own.png`.
- Why it matters: portrait phone deliberately crops the world (finding 3), so you must pan to reach targets,
  and mid-game most land under your thumb is yours. "Pan the map" silently becomes "an attack stroke that
  went nowhere". Polytopia / Root pan from anywhere and select with a tap.
- Cause: `onTouchMove` turns `maybe` into `stroke` whenever the press started on a stroke source
  (`src/render/index.ts:1141-1162`, `strokeSourceAt` 770).
- Fix (S–M): only start a stroke when the press began on the source's *plaque/figure* (not anywhere on the
  tile), or after a short hold (~150 ms), or when the drag heads toward a legal target within the first 20 px;
  otherwise pan. Keep tap-tap as the primary path.

### 3. P1 · Portrait phone shows about half the world, and the camera doesn't bring the fight to you
- Verified: portrait home view ('fill' camera mode) has only **24 of 42** territories on screen on iPhone,
  27/42 on the 360 px Android (`turn-all.log`). The Americas, Japan and most of Australia are off-screen
  (`iphone-p-10-place-home.png`), yet ~130 px of empty ocean sits between Africa and the dock.
- Verified: the human's own winning attack Kamchatka → Alaska framed the Americas with the attacker
  off-screen (`iphone-p-44-winning-blow.png`). In normal attacks the camera doesn't move at all, so on
  portrait the dice tray sits ~350 px below the two territories fighting (`iphone-p-16-dice-mid.png`).
- AI turns *do* pan/zoom to the action (`iphone-p-05-board.png`, framed on Australia).
- Fix (M, `src/render/camera.ts` fill mode + `index.ts:2708`): (a) a two-state portrait camera — an
  "overview" that fits the whole land (tap the ensō or a double-tap on water toggles) and the current fill;
  (b) when a fight is armed on a phone, ease to frame source + target above the tray (the rig already has
  `framePose`); (c) use the dead band under the land (shift fill focus down / raise `fillFrac` toward the dock).

### 4. P1 · iPad portrait: the map uses ~35% of the screen and is still clipped
- Verified: 820×1180, the land occupies y≈270–720; ~300 px of empty paper above and below; Alaska and
  Kamchatka clip at the edges (`ipad-p-05-board.png`, `ipad-p-16-dice-mid.png`). Cards open as the desktop
  floating panel over Asia (`ipad-p-30-cards.png`).
- Cause: tablets get desktop 'fit' mode (`index.ts:2708`: fill only when `compact && H > W`) and the desktop
  layout scaled (`mobile.css:4,70-73`).
- Fix (M): tablet portrait = fill mode at a gentler `fillFrac` (land ≈ 70% of height, slight crop), or a
  rotated camera yaw; put the cards and log in a side/bottom sheet with tablet sizing. iPad landscape is
  good as is (`ipad-l-05-board.png`).

### 5. P1 · Army numbers are 12–13 px on phones
- Verified: board plaque text measures 12.0–13.0 px at home zoom on iPhone portrait and landscape and Android
  (`shell.log`, `turn-all.log` "tiny text"), against the doc's own "plaques ≥ 20 px on phones"
  (`docs/MOBILE.md` §6). In landscape the selected/armed source's number is also covered by the gold stroke and
  by the territory label (`iphone-l-16-dice-mid.png`: URAL/SIBERIA labels and "17" collide;
  `iphone-p-11-place-selected.png`: "12 +5" under the ring).
- Fix (S–M, `src/render/overlay.ts` ~673 `fsz`): a phone floor of ~16–18 px for plaques (they can overlap
  tile edges; they already hide over the tray), and push the selected source's label above its plaque.

### 6. P2 · Pinch has no sensible max zoom and the board draws over the HUD when zoomed
- Verified: a 60→220 px pinch on Europe zoomed until Northern Europe filled the phone; figures and plaques
  render on top of the seat strip and under "End" in the dock, and continent borders show stair-stepped
  aliasing at that zoom (`iphone-p-20-pinched-europe.png`, first run). Selection after pinch is accurate
  (tap Ukraine while zoomed armed Ukraine). Reset view pill appears and works (44 px tall).
- Fix (S): clamp touch zoom to ~2.5× home on phones; fade pieces/plaques under the top strip and dock bands.

### 7. P2 · Count slider is too short to pick a number by thumb
- Verified: occupy/fortify slider track ≈ 80 px for 1–13 (≈ 6 px per step) on iPhone portrait and
  landscape (`iphone-p-22-fortify.png`, `iphone-l-22-fortify.png`). The default (all-but-one / max) is
  usually right, which saves it.
- Fix (S, `src/ui/hud/strip.ts` count control): on phones, make the track span the free dock width or show
  −/+ steppers beside the slider, and add "half" / "all" quick chips.

### 8. P2 · Safari landscape with the bars showing shrinks everything
- Verified: 844×340 (Safari landscape with the tab bar) makes the land ~430 px wide; the dock takes ~22% of the
  height (`safari-bars-l-61-armed.png`). Portrait with bars (390×664) is fine (`safari-bars-p-61-armed.png`).
- Fix (S–M): first-visit "Add to Home Screen" nudge on iOS (one serif line, once), and in landscape phone
  collapse the Turn Track to icons so the dock is ≤ 56 px.

### 9. P2 · Mission and AI "standing" are long-press-only on the seat pills
- Verified: holding the seat pill 900 ms on an AI seat writes its standing into the one line
  (`iphone-p-38-standing-hold.png`); nothing on screen tells a touch player this exists. Holding your own pill
  (mission) showed nothing in this non-mission game (`iphone-p-37-mission-hold.png`).
- Code: `src/ui/hud/topstrip.ts:174-196`.
- Fix (S): a small affordance (dot or "hold" hint once) on phone, or a tap on your own pill opens a small
  "you" sheet (mission, cards, continents).

### 10. P2 · Pass-and-play privacy on a passed phone
- Verified: a two-human game ends John's turn and goes straight to Sam's place step; no cover
  (`safari-bars-p-62-handoff.png`). This is a deliberate v5.1 change (`src/game/controller.ts:1447, 4302`),
  but `docs/MOBILE.md` §5 still says the hand-off cover defaults on for touch.
- Fix (S): decide; at minimum update the doc. If missions matter, a one-tap "Sam, tap to start" on phones
  only (it doubles as the moment the phone changes hands).

### 11. P2 · No haptics on iPhone; no iOS launch splash
- Inferred from code: haptics use `navigator.vibrate` only (`src/game/haptics.ts:23-36`), which iOS Safari
  lacks, so iPhone (most of the audience) gets nothing. No `apple-touch-startup-image` links in `index.html`,
  so the installed iOS app opens on a blank screen before the boot splash.
  `display: fullscreen` in the manifest is treated as standalone on iOS (fine).
- Fix (S each): iOS 18+ `<input type="checkbox" switch>` haptic trick behind a feature check for select /
  dice-land / conquest; generate 3–4 startup images with the ensō lockup.

### 12. P2 · `100vh` on tablet sheets
- Inferred from code: `.log-sheet`, `.rules-sheet`, `.settings-sheet`, `.ng-sheet` use `calc(100vh − …)`
  (`src/ui/styles.css:590,602,646,688`). On iPad Safari with the toolbar, `100vh` exceeds the visible height,
  so sheet bottoms can sit under the toolbar. Phones override in `mobile.css`. Fix (S): `100dvh`.

### 13. P2 · Landscape Settings shows three rows at a time
- Verified: in 844×390 Settings is a centered sheet the full height; volumes, AI speed and the start of Text
  size fit; the rest needs scrolling (`iphone-l-33-settings.png`). Fine but cramped; two columns would fit
  everything. Fix (S, `mobile.css`).

---

## Checked and fine (verified)
- Cold load to title in ~1.1 s on every viewport, no console errors, the document never scrolled or zoomed
  (scroll 0, visualViewport scale 1) across every flow (`shell.log`, `turn-all.log`).
- Every HUD and sheet control ≥ 44 px on every viewport (my sweep of buttons, sliders, radios, inputs:
  zero offenders). Name fields are 18 px (no iOS focus zoom).
- Title and New game put the primary action in the thumb zone on portrait (New game 342×64 at y 648; sticky
  Start 350×52 at y 780 on 844) (`iphone-p-02-title.png`, `iphone-p-03-setup.png`).
- Dock in portrait: track full width, primary button bottom-right (Place / Blitz / Move · end turn at
  y 788–836 on 844), exactly the thumb arc (`iphone-p-15-armed-by-stroke.png`).
- Drag-to-attack works and reads beautifully: the stroke arms Ural → Siberia with odds; tap-tap works too.
- Rotating mid-turn keeps the selection and count and relayouts cleanly (`iphone-p-39-rotated-midturn.png`).
- Backgrounding (visibility hidden → visible) and reload mid-turn: state restores exactly (Ural 17 before
  and after) via Continue (`sheets2.log`, `iphone-p-42-reload-title.png`).
- PWA: manifest valid (fullscreen/standalone, any orientation, 4 icons + maskable + SVG, apple-touch-icon);
  the production build registers the service worker, precaches 36 files (37 entries), and **an offline
  reload loads the title and starts a new game** (`pwa.ts`, `iphone-l-50-offline-game.png`).
- Bottom sheets on phone (cards, menu, rules, ledger) have grab handles, big rows and sit inside the safe area
  (`iphone-p-30-cards.png`, `iphone-p-32-menu.png`). Victory reads well and stacks in portrait
  (`iphone-p-46-victory-scrolled.png`).
- Shell: `user-scalable=no`, `overscroll-behavior: none`, `touch-action: none` on the board, no
  selection/callout/tap highlight, `100dvh` on the app shell (`index.html`).

## Already excellent, don't touch
- The shell hardening (no scroll, no zoom, no rubber-band, no callouts) and the 44 px discipline.
- The service worker strategy (network-first index, cache-first hashed assets, versioned per build).
- Phone bottom sheets and the two-row portrait dock with the primary in the thumb arc.
- Drag-to-attack as a gesture (keep it; just stop it eating pans).
- Orientation change and save/restore robustness.

## The three changes that matter most for v6 (mobile lane)
1. **Fat-finger-proof picking** (finding 1): legal-target-biased touch picking within a radius. Every attack
   on a phone goes through it, and the landscape layout is mostly sub-44 px tiles.
2. **A camera that works for a phone** (findings 2–3): pan from anywhere (strokes only from the figure or after
   a hold), an overview/zoomed toggle in portrait, and auto-framing of the armed fight above the tray.
3. **Readable numbers on phones** (finding 5): 16–18 px plaque floor and no label/stroke collisions on the
   armed pair. The glance test from SOUL.md ("where the biggest army is") fails at 12 px on a phone.
Tablet portrait (finding 4) is the next one: it is the most "scaled desktop" screen in the game.
