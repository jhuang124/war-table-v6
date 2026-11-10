# v6 audit: technical health

Lane: load, bundle, runtime performance, robustness, test suite, code map, deploy. Branch `v6` at fc4dbc0 (the same commit as `v5/main`). This was a read-only audit: no file under src/, tests/, docs/, maps/, scripts/ or public/ was changed. Scripts and logs are in `artifacts/v6-audit/tech/`.

> **Naming collision.** "v6" already means something in this code: the "v6 maps" pass (src/map/registry.ts:13, src/ui/screens/newgame.ts:16, src/game/presets.ts:262, lanes.ts `maps`). Pick a distinct tag for the new work, such as `v6.0` or `r6`, or the markers will mix with the old ones.

---

## 1. Baseline health

| Tier | Result | Time |
|---|---|---|
| `npm run typecheck` | pass | 0.8 s |
| `npm test` (vitest) | **426/426 pass** in 33 files | 4.1 s (4.4 s wall) |
| `npm run test:e2e:quick` | **4/4 pass**: smoke 9/9, flow 19/19, track 43/43, setup 19/19, 0 console errors | 42 s |
| `npm run test:e2e` (full) | **31/31 pass** on the first run, 0 console errors in every flow | 7 min 19 s (logic lane 176 s on 5 workers, timing lane 261 s) |

- No flakes were seen. No timing flow failed, so none needed a solo re-run.
- The machine was shared with other auditors during the run, and the timing lane still passed. That suggests the budgets have some margin, but this is one run, not a flake study.
- Logs: `artifacts/v6-audit/tech/e2e-quick.log`, `e2e-full.log`, `e2e-full-summary.txt`. Per-flow logs are in `artifacts/e2e/`.

### Tests that pin copy, timing, structure or rules (what v6 will break)

No test compares screenshots against a baseline image. The brittle layer is `window.__risk.ui()` (`UiSnapshot`, src/game/controller.ts:233-274). Flows compare its `line`, `primary`, `buttons`, `brass`, `track` and `bannerLine` with `===` or anchored regexes.

**Timing and feel pins.** These are wall-clock budgets in the timing lane, plus real-speed logic flows.

| Flow | What it pins |
|---|---|
| tests/e2e/game.e2e.ts:293-297 | single roll ≤ 1250 ms, blitz ≤ 3000 ms, readable AI engagement ≤ 1400 ms, camera ≤ 45°/s, AI turn median ≤ 6 s and p95 ≤ 12 s (:280-281), Start → first click ≤ 20 s (:75) |
| tests/e2e/ink.e2e.ts:205-207, :222 | roll ≤ 1250, blitz ≤ 3000, forced wait 0 |
| tests/e2e/round.e2e.ts:78-95 | AI turn median ≤ 6 s and p95 ≤ 12 s, a round of 3 AI turns ≤ 25 s |
| tests/e2e/feel.e2e.ts:216, :271, :185 | click → line ≤ 50 ms, worst frame on the first cold roll ≤ 50 ms, idle board has 0 tweens |
| tests/e2e/v4.e2e.ts:62, :85 | tier bands {0:[160,290], 1:[400,650], 2:[650,1200], 3:[1600,2400]} ±15 % read from `__debug.motionLog`, drift ≥ 1 px per 2 s (:58) |
| tests/e2e/chain.e2e.ts:138 | the "captured" header is held 600–1500 ms |
| tests/e2e/rematch.e2e.ts:67-69 | Rematch is live < 2.4 s into the victory wave, no board event > 3 s |
| tests/e2e/flow.e2e.ts:15, :30 | the blitz is still animating at 350 ms, click-through < 700 ms |
| tests/e2e/keys.e2e.ts:105 | Space skips mid-roll in < 700 ms |
| tests/e2e/track.e2e.ts:62, :80 | 2 s reason hold, 0.18 s ensō transition |
| tests/e2e/reasons.e2e.ts:187 | the 2 s hold |
| tests/e2e/setup.e2e.ts:84 | manual setup ≤ 60 s |
| tests/e2e/table.e2e.ts:168 | banner ≤ 300 ms |
| tests/e2e/budgets.e2e.ts:90-161 | click budgets: a turn ≤ 13 clicks by formula, skip fortify = 1 click, ten 60 ms stepper presses all register |
| tests/game/controller.test.ts:158-264 | AI median and p95, roll ≤ 650 ms on tier 1, conquest ≥ 160 ms |
| tests/game/review-r1.test.ts:324 | AI median and p95 |
| tests/game/controller-wiring.test.ts:124 | `maxCameraDegPerSec` toBe 31 |

- **Trap.** The unit tests time a *model* of the board, src/game/timingModel.ts, not the real renderer. That model already disagrees with the renderer: BLITZ_CAP is 3000 in src/game/timingModel.ts:12 and 2800 in src/render/index.ts:52. `TIER_BANDS` is duplicated in src/render/anim.ts:202 and timingModel.ts:17. Retime one copy and the unit tests keep passing while the real board drifts.
- **Trap.** The `why` text in lanes.ts for `game` says roll ≤ 1.26 s, blitz ≤ 3.25 s and brief ≤ 0.86 s. The code asserts 1250, 3000 and 1400 ms. Re-baseline from the code.

**Exact-copy pins.** These are strings the HUD must say verbatim. File:line examples:
- setup.e2e.ts:21 is the whole `ng-summary` sentence; also :44, :66, :73.
- track.e2e.ts:54-243: track labels, the `Ural → Siberia · N%` regex, `Siberia captured`, the rules card sentence, swatch names.
- flow.e2e.ts:63-114, keys.e2e.ts:23-185 and budgets.e2e.ts:24-170: most of the reason and line copy.
- chain.e2e.ts:26-212, polish.e2e.ts:203-246, hotseat.e2e.ts:29-191, handoff.e2e.ts:38, :85, table.e2e.ts:162-172 (ledger and banner regexes), endgame.e2e.ts:45 (the exact menu list), :66, :83.
- reasons.e2e.ts:20-157: 15 reason codes, each ≤ 52 chars.
- v51.e2e.ts:115, :154, surfaces.e2e.ts:117, :361-362, :438, mobile-turn.e2e.ts:103-195, mobile-sheets.e2e.ts:176.
- Unit tests: tests/game/track.test.ts, v51.test.ts, standing.test.ts, review-r1.test.ts, v4.test.ts, v5.test.ts, ledgers.test.ts:130.

**Structure and geometry pins.**
- smoke.e2e.ts:30-32: exactly four segments (`seg-place seg-attack seg-fortify seg-endTurn`), and no `btn-attack/fortify/endTurn/done`.
- v51.e2e.ts:26-58: the visible New-game labels must be exactly `Seats / Map / Length`, a list of folded ids, and 4 settings primaries.
- feel.e2e.ts:105-255: chrome top ≤ 7.5 % and bottom ≤ 14 %, die ≥ 34 px, 42 badges, numerals ≥ 17.5 px, bottom-strip rect identical across viewports.
- v4.e2e.ts:18, :37: the type scale [11,14,18,24,40] ±0.75 px.
- fight-text.e2e.ts:136-190: note position.
- ink2.e2e.ts:246: no rounded rectangles across 3 forms. ink2.e2e.ts:181, :199: the ensō within 2 px of its word.
- table.e2e.ts:71-114, :308.
- squint.e2e.ts:215-217.
- mobile-turn.e2e.ts:76-81, :204: safe areas and 44 px targets.
- mobile-flow.e2e.ts:44-134.
- maps.e2e.ts: `.map-opt[aria-checked]`.

**Rules pins.**
- setup.e2e.ts:82-83: exactly 2 manual passes, win at 30 territories.
- hotseat.e2e.ts:115-157: trade +4 with +2 on the territory, forced trade at 5 and at 6 cards.
- keys.e2e.ts:22 and mobile-turn.e2e.ts:112: army counts.
- endgame.e2e.ts:66: `of 42`.
- table.e2e.ts:163: exactly 5/2/1/1/1 ledger lines.
- Unit tests:
  - tests/engine/setup.test.ts:20-256: deals 11/11/10/10, 44 cards, batches [5,5,5,4], totals 25/30/40, defaults 21.
  - tests/engine/cards.test.ts:56-90: progressive [4,6,8,…] and fixed 10.
  - tests/engine/fortify-turn.test.ts:83-144: round wraps at `firstPlayer`.
  - tests/engine/maps.test.ts:165: 30 at 70 %.
  - tests/game/ledgers.test.ts:103-151: presets, `autoSetupBatch`.

**Which flows break for each kind of v6 change**

| v6 change | Flows that break |
|---|---|
| Feel / timing | game, ink, round, feel, v4, chain, rematch, flow, keys, track, reasons, setup, table, polish; unit tests controller, review-r1, controller-wiring |
| HUD copy | ~20 flows: setup, track, flow, hotseat, endgame, rematch, autoplay, ink, game, keys, budgets, chain, polish, fight-text, handoff, reasons, table, v51, surfaces, mobile-turn, mobile-sheets; plus 7 unit files |
| HUD structure / layout | smoke, track, flow, feel, fight-text, ink2, table, v4, polish, handoff, endgame, mobile-*, squint |
| New-game screen | smoke, setup, hotseat, game, endgame, round, track (swatches), v51, surfaces, maps, mobile-flow, mobile-sheets, ink2 |
| Rules / setup / turn order | setup, hotseat, game, keys, budgets, round, mobile-turn, table, endgame; unit tests setup, cards, fortify-turn, reinforce, maps, ledgers |

**The test-hook contract to keep** (or migrate deliberately):
- `window.__risk` is `RiskHooks`, src/game/controller.ts:276-308: `getState`, `newGame`, `dispatch`, `isIdle`/`waitIdle`, `setSpeed`, `autoplay`, `screenPos`, `stats`, `ui`, `explain`, `ledger`, `metrics`/`resetMetrics`, and others.
- `window.__board.__debug` fields: `tray`, `tokens`, `anim`, `rig`, `pick`, `hovered`, `arrow.gold`, `tiles.list`, `motionLog`, `busyWhy`.
- About 60 `data-testid`s, the storage keys `risk3d.*.v1`, and the `scenario()` engine shapes (tests/e2e/lib.ts:290).

---

## 2. Load

**Build** (production, `vite build`, 0.56 s):

| File | Raw | gzip |
|---|---|---|
| assets/index-*.js (entry) | 1,049 KB | 336 KB |
| assets/render-*.js (three.js + board) | 795 KB | 224 KB |
| assets/ui-*.js | 112 KB | 35 KB |
| assets/tray-*.js / .css (shared chunk) | 1 + 3 KB | <1 KB |
| assets/ui-*.css | 73 KB | 15 KB |
| index.html (inline splash + CSS) | 8 KB | 3.7 KB |
| **JS + CSS total** | **2.03 MB** | **~610 KB** |
| Fonts used (latin normal + italic) | 77 KB, **loaded twice** = 154 KB | (woff2) |
| Textures at boot, desktop (paper/wash 1024, streaks 2048, smoke, tip, atlas, 3 unit icons) | ~690 KB | (webp/png) |
| Map thumbs (5 PNG, precached) | 465 KB | |
| dist total | 4.1 MB, 46 files; the SW precaches 36 | |

**What is in the 1 MB entry chunk.** All five maps' `board.json` are bundled eagerly through `import.meta.glob(..., { eager: true })` (src/map/registry.ts:17, src/map/packs.ts:40-42). That is 725 KB raw and 233 KB gzip, about 70 % of the chunk. Only one map is ever drawn per page load, and the board geometry is fixed per load (src/render/activeMap.ts). The rest of the chunk is controller.ts (209 KB of source), the engine, the AI and audio. The debug HUD (22 KB) and the stub board (18 KB) also ship in the entry chunk.

**Timings.** Measured on the production build, served statically under `/war-table-v6/` with `max-age=600` like Pages, but **without gzip**: the real Pages wire is about 3× smaller for JS. Script: `artifacts/v6-audit/tech/load.mjs`, log `load.log`. Three runs each, medians shown. "Board ready" means the controller exists, which happens after `createBoardView` resolves; it is the same moment the title screen is live.

| Scenario | FCP | Board ready / title |
|---|---|---|
| Desktop 1440×900@2, cold, localhost | ~0.9 s | **0.88 s** (0.82–1.04) |
| Desktop warm (SW + HTTP cache) | ~0.9 s | **0.90 s** (warm ≈ cold: CPU-bound, not network) |
| Phone 844×390@3, cold | n/a | **0.49 s** |
| Phone, warm | n/a | **0.50 s** |
| Cold at 10 Mbps / 60 ms RTT | 1.1 s | **2.7 s** |
| Cold at 4 Mbps / 150 ms RTT | 2.7 s | **5.5 s** (canvas at 4.8 s) |

- **Requests:** the page makes 20 requests. **Every cold first visit then downloads everything again.** The server served 50 responses and 5.8 MB raw for a page that itself needs 2.2 MB. In public/sw.js:31 the install handler fetches `[INDEX, ...PRECACHE]` with `{ cache: 'reload' }`, which bypasses the HTTP cache the page just filled. It also precaches assets this device never uses: both 512 and 1024 textures, both streak sizes, all 5 map thumbs, and both icon sets. On a phone on cellular this roughly doubles the first-visit download.
- **What blocks first paint:** nothing heavy. index.html is self-contained: the device-class script, inline CSS, and a splash at opacity 0 for 600 ms. The module script is deferred. Board creation waits up to 1.5 s for fonts (`loadFonts`, src/render/index.ts:61-69). At 4 Mbps the canvas appears at 4.8 s and the title at 5.5 s.
- **Loading state:** yes. `#boot-splash` (index.html) fades in after 600 ms with a breathing ensō and is removed when the first screen shows (src/ui/index.ts:210-213). On fast machines (title at about 0.9 s) it flashes for about 300 ms. That is harmless but visible.
- **Fonts: the family is loaded twice.** index.html declares `Cormorant Garamond Variable` from `/fonts/*.woff2` with `font-display: block` and a preload. src/ui/index.ts:19-20 and src/render/index.ts:3-4 also import `@fontsource-variable/cormorant-garamond/wght.css` and `wght-italic.css`, which become `assets/tray-*.css`. That file declares the same family with `font-display: swap` and points at hashed copies in `assets/`. Chrome downloads both copies of normal and italic: about 77 KB wasted per cold visit, and both copies are precached. The result is FOIT up to the block period from index.html, then possibly a swap to the identical face.
  - Unused dependencies: `@fontsource-variable/fraunces`, `@fontsource-variable/inter` and `@fontsource/cinzel` are in package.json and nothing imports them.
- **Texture ladder:** paper and wash load at 512 on phone GPUs and 1024 otherwise (src/render/texmaps.ts:172). Streaks are 2048 or 1024. On a touch device, frames that miss the budget step the DPR down to 1.5 and the textures to L1, then L0 (procedural) (src/render/index.ts:3104-3120). Desktop has no adaptive step-down. Any texture failure leaves the procedural L0 look, so a missing texture is never fatal.
- **Service worker on update.** Navigations are network-first with a 3.5 s timeout. Assets are cache-first and content-hashed. The worker calls `skipWaiting` and `clients.claim`, and the controller shows "Update ready · reload" mid-game (controller.ts:4929). **Returning online players get the new version on their next navigation.** Small caveat: the SW's `fetch(request)` for index.html honours the HTTP cache, and Pages sends `max-age=600`, so a player can get index.html up to 10 minutes stale right after a deploy.
- **Cross-version cache wipe (P1).** The SW's `activate` deletes every cache named `war-table-*` except its own (public/sw.js:44). Cache Storage is per origin, not per path, and every version deploys to `jhuang124.github.io`. So installing v6 deletes the offline caches of `/war-table/`, `/war-table-v3/`, `/war-table-v4/` and `/war-table-v5/`, and each of those does the same to the others on its next update. Online play still works because the old SWs refetch. **Offline play of older versions breaks.**
- **Production console noise:** every boot logs `[risk] maps/test-twelve has no board.json yet … skipped`. test-twelve is a hidden test pack with no board.json.

**Concrete load wins**
1. Make install use the HTTP cache: `fetch(url)` with default cache mode for hashed assets, keeping `reload` only for INDEX. Precache only the device's texture size. Leave map thumbs and the other icon set to cache-on-use. That removes about 3.6 MB raw from first visits. **S.**
2. Lazy-load map packs: an eager glob for `pack.json`, a lazy glob for `board.json`, and `await` the active map before `createBoardView`. That takes about 233 KB gzip (725 KB raw JSON) out of the entry chunk. The registry API is sync today (`BOARD` imported in main.ts), so this is **M**.
3. Remove the `@fontsource` imports (ui/index.ts:19-20, render/index.ts:3-4) and keep the index.html faces, or the other way round. Saves 77 KB and an extra @font-face pass. **S.**
4. Code-split `debugHud`/`stubBoard` behind their `?` switches. ~40 KB. **S.**
5. Lower the font gate in `loadFonts` from 1.5 s to about 300 ms on cold loads, since troika rebuilds glyphs when the font lands anyway. Check visually first. **S.**

---

## 3. Runtime

**Method.** `tests/e2e/perf.ts` (a blitz-heavy stretch, 4 full blitzes plus 3 hard-AI turns) on an e2e build, run twice per viewport. Rest-state numbers come from `__board.getStats()` via `artifacts/v6-audit/tech/runtime.mjs`.
- The machine is a Mac on Metal and was shared with other auditors.
- rAF deltas are vsync-locked, so 60.0 fps says "never missed a frame here". It does not measure headroom.
- The phone viewport emulates size and DPR, not a phone GPU.

| Scenario | fps (rAF) | p95 / p99 / max frame | Draw calls / triangles |
|---|---|---|---|
| Fight, 1440×900@2 | 60.0 / 60.0 | 16.7 / 16.8 / 16.8 ms, 0 frames > 20 ms (2 runs) | 198 / 40k |
| Fight, 844×390@3 (rendered at DPR 2, the cap) | 60.0 / 59.9 | 16.7 / 16.8 / 16.8 and 66.6 ms (2 frames > 33 ms in run 2; likely load noise) | 198 / 40k |
| **Rest, desktop @2 (default settings)** | **draws 30–31 fps continuously** | | 196 / 40k |
| Rest, ambient setting off | 0 fps drawn (title still 29) | | |
| Rest, OS reduced motion | 0 fps drawn | | |
| **Rest, phone** | **draws ~19 fps continuously** | | |
| Title screen (attract orbit) | 29 fps desktop, 19 fps phone | | |

- **Texture memory.** I hooked `texImage2D`/`texStorage2D` and counted level-0 uploads as RGBA: about 72 MB desktop (35 uploads, one 4096 px target) and about 27 MB phone. JS heap: 42–86 MB at rest. Peak 210 MB during an instant full game, back to 78–87 MB afterwards.
- **Render loop** (src/render/index.ts:3014-3214). The loop renders on demand: it ticks every rAF but draws only when busy.
  - The "living calm" (ambient paper drift, mist, evening light) is **on by default** (`ambient`, settings v4). It keeps the GPU drawing at 30 fps desktop and 24 fps phone, dropping to two-thirds after `IDLE_SLOW_MS` (3 min). That is MSAA at DPR 2, shadows, and 196 draw calls on a board where nothing is happening. **This is the battery story.** A laptop on the coffee table between turns never idles the GPU.
  - `powerPreference: 'high-performance'` (src/render/index.ts:112) forces the discrete GPU on dual-GPU Macs.
  - Reduced motion and the ambient setting both cut rest drawing to 0, so the mechanism works. Only the default is expensive.
- **Per-frame allocation, all P2.**
  - `overlay.update` runs on every drawn frame, including ambient-only frames with a still camera. Per badge it allocates `figure()`/`proj()` tuples, `numeralBox`, and new `b.box`/`b.fig` arrays (src/render/overlay.ts:581-640). That is about 250 small arrays per frame for 42 badges.
  - `bucketsNow()` (src/render/index.ts:2766) builds a 42-entry `map().join()` string every drawn frame. `bigThree()` and `join` do the same.
  - `frameTimes.shift()` on a 240-entry array.
  - `querySelectorAll` + `getBoundingClientRect` on the fight header every 6th frame on phones while the tray shows (src/render/index.ts:3159-3176). That is a read only, with no write before it in the frame, so no forced layout thrash.
  - Nothing showed up as frame drops on this machine. It matters on a phone GPU at ambient cadence.
- **Resize and DPR.** A ResizeObserver on the container calls `resize()` (src/render/index.ts:2987). `resize()` calls `renderer.setSize` but **does not re-read `devicePixelRatio`**, which is only applied at creation and by the touch budget ladder. Dragging the window between a 1× and a 2× monitor, or browser zoom, leaves the canvas at the old DPR (blurry or oversized) until reload. The overlay reads DPR live, so numerals and board can disagree. P2, S.
- **Background tab.** `visibilitychange` cancels rAF, so nothing draws while hidden (src/render/index.ts:3215-3230). The audio context suspends (src/audio/engine.ts:71). The board's watchdog (9 s per event) still resolves `playEvent`, so an AI turn in a hidden tab crawls one event per ≤ 9 s instead of hanging.
- **WebGL context loss.** Tested with `WEBGL_lose_context`.
  - When the browser restores the context, the environment and shadows regenerate and drawing resumes in ≤ 1.5 s with no console errors.
  - When it never restores, a fresh renderer and canvas take over after 3 s and drawing resumes.
  - A second loss drops to L0 textures. This is handled well.

---

## 4. Robustness

- **Console errors.**
  - 0 across all 31 e2e flows, which include autoplay, the AI–AI ledger, and mobile flows.
  - 0 across my own all-AI full-conquest game: 4 hard AIs, instant speed, round 16, 17 s, reached victory.
  - The only production console output is the test-twelve warning on every boot.
  - `soak.ts` and `monkey.ts` exist for long sessions. I did not run them because of time and the shared machine.
- **Save and resume across a reload: works.** Mid-turn, Continue restores the same id, turn and phase (`robust.log`). The flow and hotseat flows also cover this.
- **Corrupt and old saves** (`robust.log`, `badsave.mjs`):

  | Stored `risk3d.save.v1` | Result |
  |---|---|
  | invalid JSON, `{}`, `state.version = 2`, missing `phase` | Continue is hidden, the key is kept, no error. Safe. |
  | version 1 but an **unknown `phase.kind`** (what an incompatible save from another version looks like) | **Continue is shown.** Clicking it throws `Cannot read properties of undefined (reading 'buttons')` in `buildGold`. The page stays on the title screen; Continue is a dead button that fails silently on every reload. New game still works and overwrites the save. |
  | version 1 with `territories: {}` | Continue is shown. Clicking it throws `reading 'owner'` and the page stays on the title screen. |
  | version 1 with an unknown `mapId` | Boots on classic and plays. Tolerated. |
  | corrupt `risk3d.settings.v1` / `risk3d.ui.v1` (`null`, `[]`, nonsense values) | Sanitized. Title loads cleanly. |

  - **Versioning.** `SaveFile.v` is 1 and `GameState.version` is 1. `isPlausibleState` (src/game/storage.ts:139-143) checks only `version === 1` and that the fields are non-null. There is no state migration.
  - Settings do have one: `SETTINGS_VERSION` 5 is migrated field by field in `sanitizeSettings`. UI meta is migrated in `restoreMeta`/`restoreSel` (controller.ts:498-547).
- **localStorage keys collide across versions. P0 for v6 if rules or state change.**
  - Every deployed version uses the same origin, `jhuang124.github.io`, and the same keys: `risk3d.save.v1`, `risk3d.ui.v1`, `risk3d.settings.v1`, `risk3d.boot.v1` and `risk3d.rotateHint.v1`.
  - These keys are identical in v4 and v5 (`git show v4:src/game/storage.ts`), and src/map/registry.ts:148 duplicates the save key.
  - So v3, v4 and v5 already share one save slot today.
  - **What happens with v6.** If v6 changes rules or state shape, a v5 player who opens v6 sees Continue for their v5 game. In the best case it fails as shown above. In the worst case it half-loads into wrong rules. Starting a v6 game overwrites their v5 save, and going back to v5 then hits the same problem in reverse.
  - Settings bleed both ways too: a v6 setting that v5 doesn't know is dropped when v5 writes settings back.
- **Audio unlock.** The engine is `locked` before any gesture, with no console warning. After the first click it is `running`, music starts, and 9 voices are pre-rendered. `play()` before unlock is a silent no-op by contract (src/audio/engine.ts:5). Audio suspends when the tab is hidden.
- **Accessibility hooks.**
  - The OS `prefers-reduced-motion` and an in-game setting both apply. They give steady outlines, no automatic camera moves, ambient off, and a rest draw rate of 0 (measured).
  - `aria-live="polite"` is on the line and the event slot (src/ui/hud/strip.ts:792, :829) and on the replay line.
  - There is a Text size setting (laptop/couch/tv), a colour-blind-safe default palette, and 44 px targets (mobile-turn flow).
  - `user-scalable=no` disables pinch-zoom of the page. That is intentional, since the game has its own text-size setting, but it is an accessibility trade-off.

---

## 5. Architecture map for builders

**Core flow.** Everything goes through this path:
1. input or the AI calls `applyRaw` (controller.ts:1362),
2. which runs engine `applyAction` (src/engine/reducer.ts:376),
3. then `enqueue` (controller.ts:1390) tags each event with its tier and speed,
4. then `pump` (:1442) runs `onEventStart` (:1632, a ~290-line switch), `board.playEvent`, and `onEventEnd` (:1921),
5. then `afterSettled` (:1578) runs `syncState` and `scheduleAi`.

The controller keeps two states. `state` is the truth. `disp` is the displayed state; it advances one event at a time (src/game/display.ts), and the HUD reads `disp`.

**(a) Animation timings and new effects**
- **Where durations live.** Constants are scattered across several files:
  - controller pacing: controller.ts:450-480 and :603-607 (AI_GAP_MS, AI_PLACE_MS, FIRST_BEAT_MS, LINGER_MS, AUTO_ATTACK_MS and others)
  - renderer: src/render/index.ts:50-77 (BLITZ_CAP 2800, TRAY_*)
  - motion: src/render/anim.ts:202 (`TIER_BANDS`) and :220 (`READABLE`)
  - dice: src/render/dice.ts:167-177 (verdict 220 ms, silence 250 ms)
  - tokens: src/render/tokens.ts:184 (PULSE_MS)
  - UI: src/ui/index.ts:61, and the screen fade inlined at :189/:200
- **Speed multiplier.** `Animator.speed`, with an 80 ms floor and 0 meaning instant, is set through `setAnimationSpeed`. Per-seat speed comes from `seatSpeed()` (controller.ts:1061). AI beats are compressed in `planAiBeats` (:4087).
- **Contract.** `playEvent` returns a Promise. The board's watchdog cuts at 9 s (src/render/index.ts:~2412). The controller's `PLAY_SAFETY_MS` is 15 s. `__risk.metrics()` (controller.ts:4974) reports wall-clock rolls, turns, camera speed and dropped inputs, and the e2e budgets read it.
- **Traps:**
  - Update timingModel.ts in the same change, or the unit tests drift from the real board (BLITZ_CAP already disagrees: 3000 vs 2800).
  - Move the e2e budgets listed in §1 together with the timings.
  - Any event longer than 9 s gets cut.

**(b) A new HUD element or screen**
- **Mounting.** `mountUi` (src/ui/index.ts:96) builds each component once. `render(vm)` (:401) patches them and short-circuits on VM identity, which `reconcile` (src/game/reconcile.ts) preserves. A VM field that is rebuilt every frame causes DOM churn.
- **Screens.** The `screens` map plus `showScreen` (src/ui/index.ts:172-178). `Screen` and `UiIntent` are in src/game/viewModel.ts:~627-689. Intents are handled in `intent()` (controller.ts:3538, a ~250-line switch).
- **Traps:**
  - Persistent chrome must be added to `measure()`'s rects (src/ui/index.ts:219), or the board's home view sits under it.
  - The one-line slot is shared through the `say` flags (:128).
  - Gold is computed only in `buildGold` (controller.ts:4318), and exactly one element may carry `.gold`. The ink and v4 flows check this.
  - Keys are split between the UI's capture phase (src/ui/index.ts:507) and the controller's `handleKey` (:3438).
  - The gallery fixtures (src/ui/gallery/fixtures.ts) and the debug HUD (src/game/debugHud.ts) both render the VM too.

**(c) Setup, turn order and rules in the engine**
- **Shapes.** `GameState` is in src/engine/types.ts:262 with `version: 1`. `GameConfig` is at :46, `Phase` at :158, `Action` at :295. The reducer's `validateInner` (:199) and `execute` (:388) are both switches.
- **Setup.** `createGame` (src/engine/setup.ts:177-225), where `firstPlayer = randInt` (:195).
- **Turn advance.** `nextSeat` and `startTurn` (src/engine/flow.ts:70-194). A round ends when play wraps back to `firstPlayer`.
- **RNG.** One mulberry32 `state.rng`. Any extra or reordered rng call shifts every seeded outcome downstream: the seeded e2e scenarios, and the sim tables.
- **The classic hash pins geometry only.** It covers `maps/classic/board.json` (scripts/verify-map.ts:29/82, tests/map/registry.test.ts:42). rules.json, topology.json and the engine are free to change.
- **Sim and presets.** `npm run sim` uses the AI's `decide`. Its printed tables are pasted by hand into `ROUNDS` / `ROUNDS_2P_NEUTRAL` (src/game/presets.ts:233-245), which drive the New-game length estimates. A rules change makes those estimates wrong **silently**.
- **AI coupling.** brain.ts seeds noise by `PHASE_ORD` (src/engine/ai/brain.ts:119), so a new phase kind must be added there.
- **Trap: a new `Phase` kind** must also be handled in:
  - display.ts `placeholderPhase`
  - `validateSel` (controller.ts:1269)
  - src/game/strip.ts `buildStrip`/`buildTrack`
  - `buildGold`, which crashes on unknown phases (shown in §4)
- **Trap: engine purity.** The engine stays pure, and tests/engine/no-classic-constants.test.ts bans classic constants inside it.

**(d) Adding an engine event and having render and audio react**
1. Add it to the `GameEvent` union (types.ts:340) and emit it.
2. Classify it as blocking or not in **three** places:
   - display.ts:8 `NON_BLOCKING`
   - a stale copy in render/index.ts:~2378 that already lacks the truce and standing events
   - controller.ts:576 `TRUCE_EVENTS`, which bypass the board
3. Add a display delta in `applyEventToDisplay`.
4. Add a tier in `EVENT_TIERS` (timingModel.ts); the default is 0.
5. Add HUD reactions in `onEventStart` and `onEventEnd`.
6. Add the board motion in `handle()` (render/index.ts:1942).
7. Mirror it in stubBoard.ts.
8. If it belongs in the recap or story, add it to recap.ts / story.ts.

**Traps:**
- None of these switches has a `never` exhaustiveness check, so a missed handler is silent.
- Non-blocking events update the display *before* they play; blocking events update it *after* (controller.ts:1456).
- **Audio ownership is split by contract** (src/render/BoardView.ts:195-200). The board plays place, dice, hit, conquer and march; the controller plays turnStart, cards, continent, elimination, victory and UI cues. If both play the same sound, it fires twice.

**(e) Adding a setting**
1. Add the field to `Settings` (viewModel.ts:25).
2. Add a default to `DEFAULT_SETTINGS` (src/game/storage.ts:~80).
3. **Add it to the `sanitizeSettings` whitelist** (storage.ts:113-131), or the value is dropped on every reload. Bump `SETTINGS_VERSION` if the default changes.
4. Apply it in `applySettingsToBoard` (controller.ts:1026). `setSettings` (:1081) writes it.
5. Add the UI. It is hand-laid in src/ui/overlays.ts:379-431, which disagrees with the advisory `SETTINGS_PRIMARY`/`MORE` lists. The debug HUD has a duplicate control set.

**Trap:** v51.e2e.ts:56-58 pins exactly 4 primary settings.

**(f) The New-game screen**
- `NewGameScreen` (src/ui/screens/newgame.ts:353) renders `NewGameVM` (viewModel.ts:129).
- The draft model is in presets.ts:15-387: `defaultDraft`, `sanitizeDraft`, `draftToConfig`, `lengthEstimate`, `draftProblems`. The controller adds extras in `newGameExtras` (controller.ts:619).
- Intents are handled at controller.ts:3651-3690.
- **Traps:**
  - The draft persists in `risk3d.ui.v1.lastSetup`. New fields must go through `sanitizeDraft`.
  - Picking another map writes a save plus `risk3d.boot.v1` and reloads, because board geometry is fixed per load.
  - The "More" fold state is duplicated in the UI and the controller.
  - v51, smoke, setup and surfaces pin this screen's structure.

**(g) Audio cues**
- To add a cue, update:
  - the `SfxName` union and `SFX_NAMES` (src/audio/types.ts:4)
  - the `SFX` registry (src/audio/sounds/index.ts:74)
  - lab.ts `MATERIAL` (:22)
  - `WARM_ORDER` (src/audio/bank.ts:25), otherwise the first play is rendered cold
  - the `V4Cue`/`V5Cue` union (types.ts:77-84), if the controller's `cue()` should reach it
- **Traps:**
  - The mixer's `CUE_GAP` of 70 ms keeps only the more important of two cues close together, so a new cue can be silently dropped (src/audio/mixer.ts:30-63).
  - verify.ts hardcodes counts (`v5Keyed.length !== 24`, :521).
  - Pass `distance`, not `volume`, for AI events.

**Dead code and duplicated systems**
- **stubBoard.ts** is the 2D fallback board (`?stub`, `?timings`). It must mirror render semantics by hand and ships in the prod entry chunk.
- **debugHud.ts** is the fallback HUD and also ships.
- **sandbox.ts, the gallery and lab.ts** are dev harnesses (lab.ts is needed by verify:audio).
- **Two different `strip.ts` files.** src/game/strip.ts builds the VM; src/ui/hud/strip.ts renders it.
- **Hand-off-cover residue**, all inert: the `handoff` gold, the `handoffAccept`/`tapCup` intents, the auto-accept shim in src/ui/index.ts:450, `hideCardsBetweenTurns`, and `UiSnapshot.offer` (always null).
- **Duplicated tables:** `TIER_BANDS`, the blitz cap, `NON_BLOCKING`, and the save key (src/map/registry.ts:148).
- **Unused dependencies:** three @fontsource packages.

**Why controller.ts is risky**
- It is 5,239 lines with about 123 private fields, 23 timer sites, and two 250–290-line switches.
- **Re-entrancy flags:** `pumping`, `inflight`, `blockingNow`, `aiBusy`, `aiScheduled`, `rolling`, `skipAll`/`skipBeat`, `frozenSel`, `boardStale`.
- **Every new async path must check `epoch`**, and every new field must be reset in `resetGameLocals` (:1169).
- `afterSettled` resyncs the board to the true state, which wipes any transient board state set outside events.
- **Use the injected `this.timer` / `this.now`**, never raw `setTimeout` or `Date.now`. The unit tests drive a fake clock.
- **Plan v6 so that one builder owns controller.ts at a time.** Parallel edits to its two big switches will conflict.

---

## 6. Deploy (a new Pages site for v6)

**Pattern.** Remotes `v3`, `v4` and `v5` point at `jhuang124/war-table-v{3,4,5}`. Each was pushed from a local branch to that repo's `main`. `origin` is `jhuang124/war-table`.

**The workflow works unchanged** (.github/workflows/pages.yml).
- It runs on a push to main: Node 24, then `npm ci` (package-lock.json is present), `npx vitest run`, `npm run build` (tsc + vite), and the upload-pages-artifact and deploy-pages steps.
- It does not run e2e. Run the full e2e locally before you push.

**Nothing hardcodes the path.**
- vite `base: './'` makes everything relative. In the build, index.html's `/manifest.webmanifest`, icons and `/fonts/...` are rewritten to `./`; I checked the dist output.
- manifest: `id`, `start_url` and `scope` are `./`.
- The SW is registered at `./sw.js` with scope `./` (src/main.ts:64), and it resolves everything against its registration scope.
- The title screen has no version label.

**Stale or colliding names**
- README.md:3 links to `https://jhuang124.github.io/war-table/` (the original site). v5's README has the same stale link.
- The SW cache prefix `war-table-` (public/sw.js:17) is shared across versions (see §2).
- Every localStorage key is `risk3d.*.v1` (see §4).
- package.json `version` is `0.1.0`.
- The manifest `name` is "War Table" with `id: "./"`, so separate installs are distinguished by path. That is fine.

**Do these before the first v6 deploy**
1. Namespace storage per deploy. Derive a prefix from `import.meta.env.BASE_URL` or the path, or set a `STORAGE_NS = 'risk3d.v6'` constant. Use it in src/game/storage.ts:7-9, src/map/registry.ts:148, controller.ts:572 (boot) and src/ui/hud/mobile.ts:22. Also update tests/e2e/lib.ts (it writes `risk3d.save.v1` / `risk3d.settings.v1`) and the PIN script. **M**, mostly test churn.
2. Bump `GameState.version` to 2 if the state shape or phase kinds change. Make Continue robust: wrap the restore in try/catch, and on failure show "This save is from an older version" and discard the save. Today `buildGold` throws and Continue silently does nothing. **S.**
3. Scope the SW cache: make the name `war-table-<scope path>-<version>`, and have `activate` delete only caches with its own scope prefix. **S.**
4. Fix the first-visit double download (§2, win 1). **S.**
5. Update the README Play link to `/war-table-v6/`.

**Exact steps**
```sh
cd ~/Desktop/JH-Projects/risk3d
npm run typecheck && npm test && npm run test:e2e            # all green locally first
gh repo create jhuang124/war-table-v6 --public --description "War Table v6"
git remote add v6 https://github.com/jhuang124/war-table-v6.git
gh api -X POST repos/jhuang124/war-table-v6/pages -f build_type=workflow   # Pages source = GitHub Actions
git push v6 v6:main                                         # triggers .github/workflows/pages.yml
gh run watch -R jhuang124/war-table-v6                      # build (vitest + build) then deploy
open https://jhuang124.github.io/war-table-v6/              # check: title, a turn, reload → Continue, offline reload
```
- If the `pages` POST fails because Pages already exists, use `-X PUT` with the same field. The `github-pages` environment is created on the first deploy, and its default branch policy allows `main`.
- After the deploy, check DevTools → Application. There should be one `war-table-…` cache for the v6 scope, and the v5 site should still load offline, assuming step 3 is done.

---

## Scripts and outputs (artifacts/v6-audit/tech/)
- `load.mjs` and `load.log`: cold, warm and throttled loads under a subpath, with server-side byte counts. `load-list.log` lists every request.
- `runtime.mjs`, `rest.log` and `robust.log`: rest draw rates, texture-upload estimate, the all-AI game, resume, corrupt saves, context loss, audio unlock.
- `perf.log`: tests/e2e/perf.ts at 1440×900@2 and 844×390@3, two runs each.
- `badsave.mjs` and `badsave-after-continue.png`: the dead-Continue repro.
- `serve.mjs`: the static server used for the e2e build on :5306 (stopped).
- `typecheck.log`, `vitest.log`, `e2e-quick.log`, `e2e-full.log`, `e2e-full-summary.txt`.
