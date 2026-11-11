# v6 integration brief (lead → integrators)

Four build branches are merged into `v6` (engine 8ce4900, board ef32139+4c02dc3, feel 7e8236b, ui 12fc63b).
Typecheck and 438 unit tests pass on the merged tree. Nothing in `src/game/controller.ts`, `viewModel.ts`,
`strip.ts`, `copy.ts`, `storage.ts` has been touched yet: that is this pass. The builders' new APIs are all
optional members; nothing calls most of them yet.

Lead's decisions (binding):
- **Capitals ship as a house rule under More, default OFF at every seat count.** The engine's
  `CAPITALS_ON_BY_SEATS` default (on at 3–4) is overridden: capitals flip 21–35 times a game in simulation,
  which is too often to be a moment, and a default that differs by seat count is friction. When on: +1 income.
  Name a capital's fall in the line only when its ORIGINAL owner loses it, or retakes it.
- Hard = "+1 army a turn" (engine default). No per-human handicap UI in this release.
- AI attacks are NOT re-ordered geographically (it would change AI behaviour). Camera framing covers long jumps.
- Don't edit package.json dependencies (CI runs `npm ci` against the lockfile).
- The hand-off cover stays removed.

## Part A1 · rules, setup, saves, the first minute and the last

Engine wiring (see `docs/SPEC.md` §11.9 and `tests/engine/v6.test.ts`):
1. Quiet opening (2 players): `summary.attacksLocked` / reason `OPENING_NO_ATTACK` ("No attacks on the opening
   turn."). The line and the track must explain it; End turn / the track goes Place → Fortify → End cleanly; the
   recommended-next gold outline never points at Attack on that turn.
2. A person moves first (engine does it). First turn of a game for a human: the line names their colour
   ("You're Vermilion · place 3 armies" style, plain words) and their territories pulse once (the board's
   existing pulse / the feel builder's west→east coast brighten on `turnStarted`; make sure it fires on the very
   first turn too). Round-1 recap: never claim a loss the player has already retaken; clear it properly
   (ux-desktop finding 12, controller.ts ~1679).
3. Seat picker: `DIFFICULTY_LABELS` from presets ("Hard · +1 army a turn"); remove the Draft toggle; Full
   conquest only with More open (`isAdvancedLength`; the UI reads `lengthOptions[i].advanced`); Quick's copy is
   now 60% / 8 rounds; time estimates come from `ROUNDS_BY_MAP`. A capitals house-rule toggle under More
   (default off) with one plain sentence, and the setup summary sentence mentions it when on.
4. Threat line: fill `SeatChipVM.threat` from `threatOf` ("needs 8 · holds a set worth 30" when `canWinNext`,
   otherwise just what's useful, or null). Also fill `difficulty`, `capital` ({territory, held}) and, on the
   current human's own seat during their turn, `mission`. Types: move the UI-side optional props from
   `src/ui/vmx.ts` into `src/game/viewModel.ts` properly.
5. Capitals when on: `board.setCapitals({territory: seat})` at deal and on load/resume; "+1 capital" in the
   reinforcement breakdown wherever it is shown; the fall/retake line.
6. Peace refusal copy now carries "· once a game", "· one peace at a time", "you are stronger": check every
   peace string reads as one plain sentence. Hovering a seat no longer needs to write the standing reason into
   the one line (the seat card says it); remove the duplicate.
7. Cards: send `GameVM.cards` on every one of the human's own turns/phases, not only Place. Mention the +2
   card-territory bonus in the line when a trade grants it.
8. Victory: raise the sheet when gameOver's playEvent resolves (~1.05 s) instead of the 2.4 s hold; any
   click/tap/key skips the replay (UI supports it); `VictoryVM.called` for a called game. Copy: title
   "Ochre leads", subline "Round 14 · 16 of 42 territories", called "Called in round 14 · Ochre held the most
   territories". Never "holds the world" unless they do (controller.ts ~4760).
9. Saves: namespace every localStorage key per release so versions on the same origin
   (`jhuang124.github.io/war-table-v5/`, `/war-table-v6/`) stop sharing saves and settings: `risk3d.v6.*`
   (storage.ts:7-9, registry.ts:148, and `tests/e2e/lib.ts` PIN + anything else that names the keys). A save
   that fails to restore must not brick Continue: catch, drop the bad save, and say so in one plain line
   (repro: artifacts/v6-audit/tech/badsave.mjs in the main checkout).
10. Housekeeping: remove the fontsource imports at `src/render/index.ts:3-4` (fonts load twice); README Play
    link → `https://jhuang124.github.io/war-table-v6/` and a short "What's new in v6" section; CLAUDE.md points
    the rounds table at `scripts/v6/rounds.ts`; the stale "hide cards between turns" line in docs/MOBILE.md §5.

## Part A2 · feel wiring and the turn itself

Feel requests (new optional BoardView members: `shiver`, `glintSource`, `setOverview`, `isOverview`,
`onOverviewChange`, `duckAudio`; audio `land` cue, `AudioEngine.duck`):
1. Knockout (controller.ts ~1819): `board.duckAudio?.(120)` instead of `audio.stopAll?.()`; play `eliminated`
   with no delay; the HUD dry-out and the line start at playerEliminated's start, not after the sweep.
2. Refused tap (~2831): `board.shiver?.(territory)` beside `uiError`. If the shiver/glint are too faint (the
   ink shader caps the flash at 14% ivory in `inkGlsl.ts`), raise the cap until they read at 1440 without
   shouting.
3. AI turns: `board.glintSource?.(from)` ~150 ms before each AI attack dispatch, inside the existing gap; a
   300–400 ms breath between AI seats. Budgets still hold: AI turn median ≤ 6 s, p95 ≤ 12 s.
4. Handoff to a human (~1708–1719, ~3328): play `turnStart` alone; drop `cupSet` and the 0.82 `place` click.
5. Continent bowl: play `continent` at the `territoryConquered` that completes it (the board now sweeps there),
   not at `continentGained`. Keep the human-only branch for continent lost.
6. Overview: a quiet word/mark on portrait phones calling `setOverview(!isOverview())`, driven by
   `onOverviewChange` (UI in src/ui, house style, not gold).
7. Landing: wire `tokens.onLand` only if it gives better sync than the `land` cue the feel builder already
   plays in `armiesMoved` (a 60 ms gap rule dedupes).
8. Title mode: the board hides continent labels and bonuses while the title screen is up ("Africa", "Asia +7"
   show through behind the wordmark today). Small optional BoardView member + the call.

The turn (ux-desktop.md findings 7, 8, 10, 13; design.md finding 6):
9. Undo survives placing the last army; it stays until the first roll of the turn.
10. Fight copy says what happened: after a lost roll "Lost 1 · 6 left" style; after a capture what it cost
    ("Egypt captured · cost 27" when the cost is worth saying). Plain words, no exclamation marks.
11. Keyboard: arrows and +/− adjust the count, digits set it where sensible, Enter/Space commit, U undo, Esc
    cancels a selection first and opens the menu only when there is nothing to cancel, `?` opens the keys sheet
    (src/ui/hud/keys.ts lists exactly these).
12. Less busywork: the move-in default after a capture is what the AI would keep (not always "all"); after a
    conquest, arm the next good attack from the territory just taken when one exists (never rolls by itself).
13. `NameCardVM.rect` (client px of the territory) so the hover card sits beside the territory.

## Part B · e2e re-baseline (after A1 and A2)

Run the full suite on a quiet machine. Expected breaks (intentional; move the assertion, list it):
- stone/count sizes and positions, `PIECE_AIR`, dim level on selection, `ink.cont`/label colour, count text
  read immediately after a gain ≥ 2 (tick-up): table, surfaces, feel, v4.
- verdict silence 250 ms / hush ≈ 220 (now an 80 ms hush before the last die); the desktop ring beside the
  fight / `onTrayChange rect.header` (tray is fixed now); pinch past 2.5×; quick sideways drag from own land
  (now pans).
- v4 type scale; feel chrome bands; grudge/continent tick testids gone; `count-expand` gone (stepper); New
  game switch labels include On/Off; victory awards under Full stats; pwa cache-name regex; ink2 "no rounded
  rectangles" vs the switch knob; chips take keyboard focus.
- 2-player flows that attack on turn one; flows expecting a specific first seat; peace copy; Quick "12
  rounds"; Draft toggle; seeded boards (AI behaviour changed).
- tests/e2e/lanes.ts prose for `game` disagrees with the code budgets: re-baseline from code.
Budgets that must still HOLD (a failure here is a regression to fix, not an assertion to move): single roll
≤ 1.25 s, blitz ≤ 3.0 s, readable AI engagement ≤ 1.4 s, AI turn median ≤ 6 s / p95 ≤ 12 s, forced wait 0,
idle tweens 0, click → line ≤ 50 ms, worst frame ≤ 50 ms, 0 console errors.
