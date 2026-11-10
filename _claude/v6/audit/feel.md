# v6 audit: game feel (input, motion, juice, the fight, transitions, sound sync)

Auditor lane: feel. Branch v6 (= v5). Captures: `artifacts/v6-audit/feel/<scenario>/` (CDP screencast frames
at ~17–20 ms, `timeline.txt` = in-page `performance.now()` log of every `playEvent` start/end, every audio call,
pointer input and HUD strip change, zeroed at the scenario's `go` mark; `sheet*.jpg` / `c-*.jpg` = contact
sheets, labels in ms). Harness: `artifacts/v6-audit/feel/cap.ts`, sheets: `sheet.ts`. 1280×800, dpr 1, muted.

How to read the evidence tags:
- **[cap]** seen in a capture (path given) or measured in-page (ms from the timeline log; in-page clocks, not stopwatch).
- **[code]** inferred from source constants (file:line). Wall-clock numbers on this shared machine are noisy;
  every ms below is either an in-page timestamp delta or a code constant.

## Verdict in one paragraph

The *input* layer is genuinely good (selection visible 23 ms after pointer-up, sounds 1–10 ms after the
action, a pre-rendered bank with a 6 ms lookahead, a live brush stroke). The *consequence* layer is where
v6 should spend: the outcome of a roll arrives ~500 ms after the dice have visibly settled, both pair verdicts
land 33 ms apart (one event, not two), a capture's sound leads its visible flood by ~200 ms, an army that
moves shrinks to a token and pops back full size, a continent changing hands is near-invisible, and a blitz is
a 20 Hz counter whose climax restarts from an empty tray. Nothing is broken, but nearly every *big* moment is
played at the same volume and scale as a routine one. AAA here does not mean louder; it means the decisive
beats get timing, scale and silence the routine ones don't.

## Interaction table

ms = in-page from the triggering input unless noted. "1x" code constants in brackets.

| # | Interaction | Current timeline (ms) | Verdict | Proposed change |
|---|---|---|---|---|
| 1 | Hover a territory | lift+light 90 ms outQuad [code index.ts:629]; name appears; no sound (pinned by polish.e2e:75) | Good. Quiet, immediate. | Keep. |
| 2 | Select (tap) | down 568 → up 649 → `tick` 650 → ghost "+12" & rim on screen by 672 [cap select/c-click.jpg]; press dip −0.05 lift 60 ms, release outBack(1.5) 90 ms [code index.ts:869] | Excellent latency. Press dip too small to see at 1280. | Optional: press dip 2× deeper. |
| 3 | Invalid tap (enemy in Place) | up 1684 → `uiError` vol 0.25 at 1685 → line text 1714; **board: nothing** [cap select/c-invalid.jpg] | Off-locus: the eye is on the tile, the answer is 600 px away at the bottom in small type. | 120 ms rim shiver / dark ink flick on the tapped tile + same soft tick. No camera shake. S. |
| 4 | Cancel (Esc) | line swaps in 23 ms, rim drops 120 ms inQuad | Fine. | Keep. |
| 5 | Place 1 (×3 quick) | each: event 1–3 ms, `place` 2–14 ms after; stone resize 180 ms outCubic overshoot 0.04, soak 200 [code tokens.ts:1246] [cap place/] | Sound sync perfect; streak pitch rise (+3%/stack) is a nice touch. Overshoot 0.04 is invisible. | Squash/settle on the stone 0.10–0.12 overshoot, 1 px ink splash ring on contact. S. |
| 6 | Big reinforcement (12 at once) | identical to placing 1: one drop, one click [cap place/timeline 1881–1891] | Weight doesn't scale with size: 12 armies feels like 1. | Count tick-up on the plaque (0→12 over ≤300 ms, ticks thinning) + stone grows in 2–3 swells, the click layered heavier past 5. S–M. |
| 7 | Track auto-advance Place→Attack | +250 ms `place` (rate 0.82) [controller.ts:3328] | A wood "placement" click for a phase change is a mislabel. | Own cue (the `sheet`/`tick`) or none. S. |
| 8 | Arm by tap-tap | `tick` +0; lean-in 260 ms + `fightCold` +4 ms [code index.ts:1770, controller.ts:2469] | Good, but the anticipation (lean, cold paper) is spent at *arm*, so Roll gets no new beat. | Keep lean at arm; add the push to the decisive roll (row 12). |
| 9 | Arm by drag stroke | stroke sound +11 ms after drag start, gold stroke follows pointer; release → armed +11 ms, line +31 ms, gold settles into ivory arrow [cap stroke/c-stroke.jpg] | Best interaction in the game. | Don't touch. |
| 10 | Single roll (full) | click 977 → shake 989 (120) → ring 220 → first die lands 1273 → last 1555 → hush 1659 (220) → pair hits 2057 **and 2090** → end 2157. Total 1180 (budget 1250) [cap roll/timeline.txt] [code dice.ts:729] | Pour + per-die click + squash is lovely. **Then ~500 ms of nothing** (last click → first verdict) while the faces are already readable; the two pair verdicts are 33 ms apart, so "pair by pair" reads as one. Hairlines are thin and faint at couch distance [cap roll/c-verdict.jpg]. | Re-time inside the same 1.25 s: hush 250→~90 ms *before* the last die lands (the last die hangs/teeters = anticipation), first verdict ≤150 ms after settle, pairs 140–180 ms apart, each pair = hairline + a visible ink burst on the loser + the stone knock on the board in the same frame. M. |
| 11 | Repeat roll | no shake, first die at +195 ms; same 500 ms dead gap [cap roll/timeline 3394–4458] | Fine pace; same verdict issue. | As row 10. |
| 12 | Decisive roll (captures) | identical to a routine roll; then `territoryConquered` at verdict end [cap capture/timeline 2474→2575] | No dynamic range between "−1" and "it's mine". | Engine already knows the outcome when the event plays: give captures (and continent-completing / eliminating rolls) a hit-stop (80–120 ms full freeze incl. dice, score ducked), slower final hairline, a 2–3 % camera push to the target, then the flood bursts from the impact. Routine rolls stay as they are. M. |
| 13 | Capture (flood) | `conquer` at 2575; defender figure smokes 420 ms; flood 600 ms **inOutCubic** visibly starts ~2776, done ~3043 [cap capture/c-capture.jpg]; then lean-out pans the board 600 ms | Sound leads the visual by ~200 ms (slow-in easing). Flood itself is beautiful. | Flood front on outQuart (fast start, long soak) so the wet front moves with the sound; or delay the cue to visible onset. S. |
| 14 | Capture sting semantics | `conquer` variant `somber` whenever the *victim* is human, incl. a human attacker's own win [code index.ts:2225, controller.ts:1407] [cap capture/ blitz/ continent/ timelines] | In a 2–4 human couch game (the core use case) every capture the active player makes plays the "your land fell" sting. | Two layers: the taker's bright stroke always; the torn/somber layer under it only for the victim, panned to the victim. S. |
| 15 | Occupy move (human) | press Move → `march` +0 (duration-matched 400–500 ms) → stack lifts, **shrinks to a small figure carrying "17"**, walks, **pops in full size** at arrival with no landing sound [cap capture/c-move.jpg] | Mass teleports: big → tiny → big. Arrival has no impact. | Traveler keeps the stone's scale (or 2–3 figures for big counts), lands with squash + wood thunk, number ticks onto the plaque. M. |
| 16 | Blitz (23 rolls) | first 668 → middles **50 ms each** (20 Hz: one click + one hit per 50 ms) → final re-pours from an **empty tray** at 1729 → 500 ms dead → verdict 2662 → capture 2763. Total 2752 (budget 3000) [cap blitz/timeline, blitz/c-blitz.jpg] | The middle is a counter, not a fight. Drum pitch ramp caps at 1.45 by roll 8 and is flat for the last 13 rolls: no build. The final roll empties and refills the tray, which reads as "restart", not climax. | Middles ≥90 ms (batch 2 rolls per beat when long), pitch/density keyed to *defender remaining* (tension climbs toward the capture), dice stay in the tray into the final (final = the middle dice settling hard, not a re-pour), decisive-roll treatment from row 12 at the end. M. |
| 17 | Repulse | verdict 1075, arrow retracts 450 ms (tier 1), lean-out pan 600 ms, `-1` chip [cap repulse/c-repulse.jpg] | Retract reads well. Loss on the stone is small. | Keep; inherit row 10 verdict. |
| 18 | Continent taken | fires **after the occupy move**, not at the capture (engine order) [cap continent/timeline 3526]; outline tint sweep 600 ms + label glow [code continents.ts:199]; at 1280 the change is barely perceptible [cap continent/c-gain2.jpg]; `continent` bowl sound at start | The biggest positive non-terminal beat is the quietest visual on the board, and it lands a beat late. | Thicker re-ink, wash pulse territory-to-territory (60 ms stagger), "+N" ticks bright and drifts to the seat chip; play it at the conquest (the board can detect completion from `stateAfter`). M. |
| 19 | Continent broken | `continentLost` = `refresh` + **300 ms wait with nothing visible**, **silent** unless a human lost it [cap broken/c-lost.jpg, broken/timeline 3527–3827] | Dead time + silence on a strategically huge event. | Outline drains from the broken territory outward (300–400 ms, the existing time), the damped bowl at distance for AI-vs-AI. S. |
| 20 | Elimination | `stopAll` **hard-cuts** the conquer cue 167 ms in; `eliminated` +150 ms; sweep 900 ms + settle; ~800 ms with little motion; the words "John knocked out Theo" land at +1300, **after** the sweep [cap elim/c-elim.jpg, elim/timeline 1868–3170] | Sound-first, words-late; the hard cut is audible as a glitch, not a hush. | Duck (not stop) over 120 ms; name it in the line at the sweep's start; seat chip dries/strikes in sync with the sweep. S. |
| 21 | Fortify | march 220 ms/hop ≤900, dotted route drawn ahead [code index.ts:2252] [cap fortify/] | Good. | Inherit row 15 landing. |
| 22 | End turn → human seat | click → 4 cues in the same ms (`place` 0.82 + `cupSet` + `turnStart` + chord turn) + delayed `pour` [cap handoff/timeline 6–8]; board: 8 % wash breath (820 ms); line rewrites in ~330 ms [cap handoff/c-bottom.jpg] | Instant, which is right; but it's a text swap. From the couch the board doesn't "turn to" Sam. Three wood/sheet cues stacked = mud. | One cue (cupSet + turnStart, drop the track click). Board-level beat: the new seat's coasts brighten west→east (reuse `pulsePhase`), non-blocking, ~500 ms. S. |
| 23 | End turn → AI turns | AI engagements every ~830 ms, consecutive ones on different continents (Venezuela → Ontario → Yakutsk → N. Africa → N. Europe) with no camera framing and ~115 ms between a march end and the next stroke; next AI seat starts in 0 ms [cap aiturn/timeline, aiturn/c-cobalt.jpg] | Follows like a log playing back. The pair rim is the only locator; the eye arrives after the stroke. | Lead-in glint on the source 150 ms before the stroke; order an AI's attacks geographically or frame when the jump > 0.4 board widths; 300–400 ms breath between AI seats. M. |
| 24 | Game start (deal) | `territoriesDealt` 1523 ms west→east bloom (35 ms stagger, 320 ms outCubic each) with paper ticks [cap start/c-all.jpg] | Good staged reveal. | Keep; maybe a final settle chord when the last blooms. |
| 25 | Victory | winning roll → somber conquer → hard cut → eliminated 1.28 s → march → continent sweep → `victory` + gameOver; a static board with "Sam was knocked out by John" for ~2.4 s; the sheet rises at ~6.4 s and reads at ~7.1 s after the click [cap victory/c-all.jpg, victory/f4500.jpg] | The payoff is a paper sheet after a long static hold. The board, the hero of the game, doesn't celebrate (`victoryDry` only dries *other* washes). | Winner's ink spreads/pulses across their territories in one wave, the score resolves (major chord, the room warms), sheet ≤1.5 s after the last event. Cut the static hold. M. |
| 26 | Idle | 12 s frame diff: PSNR 36 dB, no region visibly changed except the ensō [cap idle/diff.png] | Calm, but the "drift you can see" barely reaches the screen at 1280 (caveat: JPEG q60 capture; check on a real display). | Raise mist contrast a touch if confirmed. P2. |

## Sound map

| Cue | Trigger (file:line) | Sync |
|---|---|---|
| tick | select changes (controller.ts:2712), round numeral, deal | +1 ms after pointer-up [cap] |
| uiError | refused click, vol 0.25 (controller.ts:2831) | +1 ms; no board counterpart |
| uiClick / uiHover | HUD buttons (ui/index.ts:486,499) | uiHover fires on the click itself when the pointer jumps onto a button |
| place | stone contact (index.ts:1371), **also** track advance rate 0.82 (controller.ts:3328), setup staging | contact +2–14 ms |
| unplace | undo | — |
| pour | turn start for humans +0.6 s, trades | delayed by design |
| diceShake | full roll start (index.ts:2138) | +12 ms |
| diceLand | per die landing (index.ts:2139); readable AI beat (index.ts:2053, 0.3 vol) | on the landing frame |
| hit (+ 'pair'), splash | per pair verdict (index.ts:2163); middles 0.5 vol | on the hairline arrival |
| hush | verdict silence (index.ts:2151) | 220 ms |
| glint | first roll over a sea lane | +1 ms |
| conquer (somber) | territoryConquered start (index.ts:2226) | ~200 ms before the flood is visible |
| march | armiesMoved, duration-matched | good |
| continent / somber | controller.ts:1791, 1804 (human only for loss) | at event start; **after** the occupy |
| eliminated | after stopAll, +150 ms (controller.ts:1820) | stopAll is a hard cut |
| victory | gameOver (controller.ts:1906) | — |
| turnStart, cupSet, turnPassed (score) | turn start | stacked with the track `place` click |
| whoosh | camera moves > 0.3 board widths | — |
| stroke (live) | draw-to-attack, speed-following | +11 ms |
| **Never triggered** | `rattle`, `cupSlide` (no call site); `bone` only in stubBoard | dead bank entries |

Score reactivity (good): evening deepens per round, chord turns on handoff, cold room at arm, hush at the
verdict, a cold lean on a human's loss, thinning when idle. Missing: any escalation with stakes (a long blitz,
a capture streak, final round, a seat near death) and a resolution on victory.

Dynamic range: routine roll vs decisive capture — identical dice, hit and hush levels; the only difference is
the conquer cue that follows. Elimination cuts everything rather than shaping it.

## Consistency

- One easing family, used consistently: outQuad 17 / outCubic 16 / inOutSine 13 / linear 12, outBack only 3×
  (select lift, press release). Duration tiers (`TIER_BANDS`) are a real vocabulary. Coherent and calm.
  Two copies of `TIER_BANDS` (anim.ts and timingModel.ts) must stay in sync.
- The vocabulary lacks an *impact* word: almost nothing overshoots, squashes or holds (dice land squash is
  the exception). Everything eases in and out; so nothing lands.
- Dead time: dice settle → verdict ~500 ms; continentLost 300 ms; elim sweep's last ~800 ms; victory's
  ~2.4 s static banner; occupy waits on a button after every capture (pacing lane, but it kills momentum).
- Too fast to read: blitz middles 50 ms; verdict pairs 33 ms; AI engagements 830 ms hopping continents.
- Input blocking: none found that matters — a tap during motion skips it (controller.ts:1608 skipAll); the
  track waits during a roll by design.

## Tests a change would touch

game.e2e:293 / ink.e2e:205 single roll ≤1.25 s · game.e2e:294, ink.e2e:206,222 blitz ≤3.0 s · game.e2e:295
readable AI ≤1.4 s · game.e2e:280–281 AI turn median ≤6 s / p95 ≤12 s · game.e2e:285 & ink.e2e:207 forced
wait 0 · v4.e2e:85 tier bands ±15 % · polish.e2e:75 hover silent; :183–184 fight counts never ahead of the
board · feel.e2e:185 idle 0 tweens, :216 click→line ≤50 ms, :271 first roll worst frame ≤50 ms ·
rematch (deal ≤3 s). Also `timingModel.ts` (the stub board's model) must follow any dice re-timing.
