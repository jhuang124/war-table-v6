# v6 audit: game design (pacing, balance, decisions, AI, rules, the end)

Auditor lane: game design. Branch v6 (= shipped v5). Read-only on the codebase; every number below comes from the
shipped engine and AI, driven by my own scripts in `artifacts/v6-audit/design/` (harness `lib.ts`), plus one stock
`npm run sim 200` (`sim-classic-200.txt`). Nothing under src/ was edited; rule variants were simulated by mutating the
state after `createGame`, overriding actions, or re-valuing trades in a post-action hook.

**Measured vs reasoned.** "Measured" = simulated with n stated. "Reasoned" = my judgment, flagged. All simulated
players are AIs; seat 0 in the "default table" is the classic normal AI flagged `kind: 'human'` (so standing and
peace treat it as a person), the other seats are normal AIs with random personalities, standing on, random deal,
auto placement, progressive cards, connected fortify (the shipped New game default). Humans play differently,
so treat the AI numbers as the shape of the game, not a forecast of a specific evening.

Wall-clock model: human turn 80 s (presets.ts `HUMAN_TURN_S`); AI turn from the controller's readable reel
(0.76 s + ~1.23 s per engagement, beats past 5 compressed up to 4×), calibrated so the median AI turn is the
measured 5 s.

## Key numbers

| | 2 seats | 3 seats | 4 seats |
|---|---|---|---|
| First mover win rate (fair 50 / 33 / 25%) | **75.6%** (n=1000; default table 76.8%) | 36.8% (34.2% default) | 24.2% (21.5% default) |
| Quick: rounds med/p90 · min (1 human + AIs) · min (all human) | 5/8 · 7 · 12 | 7/11 · 10 · 27 | 9/12 · 12 · 45 |
| Evening | 6/9 · 7 · 15 | 9/14 · 12 · 35 | 11/15 · 14 · 51 |
| Full conquest | 8/12 · 10 · 19 | 14/25 · 17 · 48 | 15/26 · 18 · 64 |
| Army share at which the leader wins ≥ 90% | ≥ 60% | ≥ 80% | ≥ 80% |
| Foregone rounds after that point: Evening / Full (median, p90) | 1 (4) / 3 (6) | 0 (0) / 1 (5) | 0 (0) / 1 (8), mean 2.9 |
| Seat-0 knocked out before the end: Evening / Full | — | 8% / 28% | 30% / 50% |
| Rounds watching once out: Evening / Full (median) | — | 1 / 4 | 2 / 6 |
| Wait between your own turns (1 human + AIs / all humans) | 5 s / 1.3 min | 7 s / 2.7 min | 10 s / 4.0 min |

Classic, n=300 per cell (exp1). The other maps are within ±1 round except Modern Boston (25 territories), which
runs ~3 rounds shorter at 4 seats: full table in `artifacts/v6-audit/design/exp1-out.md`.

## Findings, ranked

### 1. P0 · 2 players: whoever moves first wins three games in four
- **Evidence (measured).** 75.6% (n=1000, classic AIs, random deal + auto place; ±2.7) and 76.8% on the default
  table. The stock sim reports 87.5% because it mixes in draft and manual setups, which are worse (finding 9).
  3p and 4p are fair within CI (exp2).
- **Cause.** Round 1: the first player brings 7 fresh armies into a board nobody has reinforced and takes 7.2
  territories; the reply takes 5.0. At round 2 the first player leads armies in 62% of games and wins 89% of
  those. It is the first strike, not the extra placement: "nobody attacks in round 1" changes nothing (75.7%).
- **Fixes, simulated (2p, n=1000 each):** first player may not attack in round 1 → **48.2%**; second player +8
  starting armies → 47.5% (+5 → 58.0%); neutral seat → 57.4% (and +2 rounds); first player gets no round-1
  reinforcements → 41.5% (overshoots).
- **Proposal.** In 2-player games the first player's opening turn is place + fortify only ("Attack opens next
  turn" on the track). It's one sentence, needs no setup, and reads as a rule rather than a handicap. Size S:
  `validateInner` attack/blitz in `src/engine/reducer.ts` (add a `round === 1 && currentPlayer === firstPlayer &&
  2 seats` refusal, behind an additive config flag such as `openingStrike?: false`), `brain.ts` `bestAttack`
  returns null in that case (otherwise the fallback quietly ends the turn), plus track copy. With this in place,
  the neutral seat goes back to being flavour, not a fairness patch.

### 2. P1 · The three personalities play the same game
- **Evidence (measured, 4p default table, Evening, n=300 games):** fights per turn Turtle 6.36 / Opportunist
  6.46 / Warlord 6.64 / classic 6.35; mean blitz odds 0.92 / 0.91 / 0.90 / 0.89; share of attacks on the table
  leader 51 / 48 / 50 / 51%; win share 26.0 / 24.0 / 26.3 / 23.7%. Stock sim: 90–95% of every personality's
  fights are lopsided (≥ 3:1). The only visible difference is the voice line. Pillar 4 ("the rivalry is
  real") rests on opponents having characters, and the board doesn't show any.
- **Proposal.** Widen the knobs until each one shows on the board within two rounds, or fold them into one AI.
  Turtle: about 3 fights a turn, attacks only to finish or defend its continent plus one card grab, deep
  borders. Warlord: 9 or more fights, takes 55–65% fights (the only seat that ever gambles: the spectacle),
  always presses its grudge seat. Opportunist: hits only the seat that was just hit or the weakest, and always
  finishes a kill. Size M: `PERSONAS` deltas in `personaFor`, `TEMPERAMENTS` in
  `src/engine/ai/personality.ts`, `bestAttack` in `brain.ts`. Not simulated, because the personality deltas are
  hard-coded in a switch. Gate: rerun exp3 table A and require at least 2× spread in fights per turn and
  seat win shares that stay within 20–30%.

### 3. P1 · "Hard" isn't hard; the lever that works is armies
- **Evidence (measured, one AI among three normals, Evening, n=500).** Easy 4.0%, Normal 24.3%, Hard 27–29%
  (fair 25%). The best Hard knob I found (`overextendCare 0.3`) reaches 32.6%. A heuristic AI in a 4-seat dice
  game has a low ceiling. A plain income bonus works much better: +1 army per turn → **38.8%**, +2 → **51.8%**,
  +3 → 61.0%.
- **Proposal.** Define difficulty by armies and say so in the line ("Hard: AIs get +1 army a turn"), and offer
  the same lever per seat as a **head start** for a table where one friend is much better (deepen item C). Size
  S: `startTurn` in `src/engine/flow.ts` adds a per-seat `config.bonus?` (additive), presets UI. Simulated.

### 4. P1 · The end arrives as a card sweep nobody saw coming
- **Evidence (measured, default table, Evening, n=300).**
  - At the start of the winning round the winner still needs a median of 8 territories (4p; 6 in 3p).
  - The winning turn takes 10 territories (p90 17), against 3 on an ordinary turn.
  - 73% of winning turns cash a set worth a median of 40 armies (4p). Sets are worth 20 by round 8 and 30 by
    round 10, against a median living-seat income of 5.5.
  - A visible "within 4 of the goal" state appears before the win in only 42–46% of games, and the win usually
    comes in that same round.
  - The good news: Evening ends when the game is decided (0 rounds of foregone play after the 90%-confidence
    point in 3–4p).
  - The bad news: it ends in one turn the table didn't watch coming.
- **Alternatives tested.**
  - *Hold to win* (you must still hold the threshold when your next turn starts): adds 3 rounds (+30%,
    9→12 in 3p, 10→14 in 4p). 76–78% of games see a claim knocked back, and the first claimant loses 13–20%.
    That's real drama, but it breaks Pillar 5. Even at 60% plus hold, games run 11/13 rounds against 9/11
    (n=300–400, exp5).
  - *Capping set values*: capped at 15, 4p gets 2 rounds longer, the sweep shrinks 13→11, and predictability
    doesn't change (round-5 leader wins 41→43%). That isn't worth a rule change (exp7).
- **Proposal (reasoned).** Make the threat legible instead of changing the rule. Each turn, the leader's line
  shows the gap and the loaded gun ("Sage needs 8 · holds a 40-army set"). The AIs' anti-leader pull
  (`leaderWeight`, 0.3 on normal) jumps when a seat can plausibly win next turn, so the classic Risk dogpile
  happens on screen. Size S–M: a `threatOf(state, seat)` helper in rules.ts, `targetValue` in `brain.ts`, one
  line in the UI (that lane's call). Not simulated (no human reaction to model).

### 5. P1 · The length presets are badly spaced, and Full conquest is a mop-up
- **Evidence (measured).**
  - Quick and Evening are about 2 rounds apart: 4p 9 vs 11, 3p 7 vs 9, 2p 5 vs 6.
  - Quick's 12-round cap fires in only 9% of 4p games.
  - Full conquest adds 4 rounds to 4p, with a foregone tail (p90 8 rounds).
  - In Full, half of 4p games knock the human out, and they then watch a median 6 rounds (≈ 1 min with AIs,
    ≈ 24 min at a four-human table).
  - presets.ts scales non-classic maps by size, which underestimates Boston (scaled 6.6 rounds against a
    measured 8) and slightly overestimates Roman.
- **Proposal.** Two lengths that actually differ: **Short** (60%, cap 8 rounds; about 30–40 min with four
  humans) and **Evening** (70%, about 50 min). Retire Full conquest, or keep it under More with a concession
  button (the menu's "End game now" already exists). 2p gets one length. Paste the measured per-map rounds from
  `exp1-out.md` into `ROUNDS` instead of `sizeScale`. Size S: `lengthRules` and `ROUNDS` in
  `src/game/presets.ts`. Partly simulated (the cap's effect is derived from trajectories).

### 6. P1 · At a human table, the wait is human turns; per turn, most fights are foregone
- **Evidence (measured).**
  - With AIs, the gap between your own turns is ~10 s (4p). With four humans it is ~4 min (3 × 80 s). The AI
    reel is not the problem.
  - Per turn, AI-equivalent play makes 6.4 engagements at mean odds 0.89–0.92 (90–95% lopsided).
  - It answers about 3 occupy prompts (half resolved at min or max) and fortifies 0.6 times.
  - It attacks from a median of 4 different stacks, and only 40% of fights continue from the territory just
    taken (exp9).
  - So a human turn is mostly "pick off the 1-army territory at 90%+" clicks: select, Blitz, Move, about 3
    actions each, roughly 20 of the ~30 actions in a turn.
- **Proposal (reasoned).** Cut the human turn, not the AI turn. (a) Make the occupy default smart rather than
  always "all but one": keep the border garrison the AI's `chooseOccupy` would keep, so the confirm press
  becomes one Enter. (b) Blitz chains automatically: after a conquest, the new territory is armed on its best
  ≥ 80% neighbour, and Enter or Space rolls it. (c) Leave the planning decisions alone: where to place, which
  continent, when to cash. Size M, controller (desktop and mobile UX lanes own the surface). Every 20 s saved
  per human turn is a minute per round at a four-human table.

### 7. P1 · Peace is a free action, and spamming it bloats the game
- **Evidence (measured, n=600).** A seat that asks its biggest neighbour for peace whenever allowed is accepted
  **96–97%** of the time, and games run 9→14 rounds (3p) and 11→17 (4p). That is a naive policy that also never
  attacks its peace partners, so it is an upper bound on the bloat. Standing bands at turn start: ally 1.3%,
  even 19%, wary 41%, hostile 38%, with ~75 band changes per 4p game. AI–AI understandings form 0.35 times
  per 4p game (in 25% of games) and 0.03 times per 3p game: effectively invisible.
- **Proposal.** Peace must cost something or be scarce: one ask per game per AI, or the AI accepts only when
  it gains from it (it is fighting someone else, or you are weaker). Collapse four bands to three people can
  read (ally · neutral · hostile). Size S: `peaceAnswer` and `WARY_ACCEPT` in `src/engine/standing.ts`, and
  `PEACE_ASK_ROUNDS`.

### 8. P1 · Missions, when on, are the game
- **Evidence (measured, default table, Evening, n=300).** 76% (3p) and 79% (4p) of games end by a secret
  mission, 2–3 rounds sooner. 15% of 3p games end by round 4, against 3% without missions. The territory goal
  becomes vestigial, and the win is invisible until it happens, the opposite of "the board explains the
  state".
- **Proposal.** Keep it off by default (it is). If it stays, make it **public objectives** (two face-up per
  game) so the table can see and block them. Otherwise move it behind More with "short, swingy" in its line.
  Size S. Not simulated as public.

### 9. P2 · Draft and "Place your own" worsen first-mover advantage
- **Evidence (measured, n=600).** 2p first mover: random+auto 75.2%, random+manual 80.2%, draft+auto
  **90.7%**, draft+manual 88.3%. 4p first mover: 22.7% / 31.7% / 31.3% / 35.7% (fair 25%). Draft also adds
  ~10 min. AI draft play clumps; humans may do better (reasoned).
- **Proposal.** Cut Draft. If it is kept, the last seat picks first or the order snakes. Size S
  (`src/engine/reducer.ts` claim order, presets).

### 10. P2 · Continents churn; only the small, sealed ones pay
- **Evidence (measured, 4p, full trajectories, n=300 per map).**
  - Asia is held at 13% of turn starts with a median hold of 1 turn. Europe: 26%, 1 turn. Italia (Roman):
    17%, 1 turn.
  - Australia is held at 78% (median 9 turns), Britannia 75% (10 turns), Allston–Brighton 88% (9 turns).
  - Bonus per border is ~1.0 on every map except the one-border minis.
  - Late-game sets (30–45) dwarf bonuses (2–7), so the continents-vs-cards tension collapses into cards from
    about round 8.
- **Proposal (tuning).** +1 or +2 on the big contested continents (Asia 7→9, Europe 5→6, Italia 5→6, Graecia
  6→7), and Allston–Brighton 1→0 or merged (it's a free +1 for whoever is dealt Allston). Size S: maps/*/rules.json.
  Per-map tables in `exp3-out.md` section C.

### 11. P2 · Snowball and comebacks are healthy at 3–4 seats; leave them alone
- **Evidence (measured).**
  - A leader with 50% of living armies wins only 54% (4p) and 60% (3p).
  - The round-5 territory leader wins 41% (4p) and 55% (3p), against 82% in 2p.
  - There are 5.3 lead changes per 4p game.
  - Progressive cards flow mostly to second place (45% of card armies in 4p; the trailing seat gets 6%), which
    produces lead changes, not kingmaking.
  - Fixed cards: lead changes fall to 4.5 and the 70% length tail grows (p90 22 vs 15).
- Keep progressive. Concessions aren't needed at Evening, because it already ends at the decision point.

### 12. P2 · AI quality is sound; its fights are timid
- **Evidence (measured).**
  - In detected kill chances (≤ 2 territories, ≤ 6 armies, a 3:1 stack beside each), the AI misses the kill in
    1 of 27.
  - It leaves a held continent with a 1-army border next to a 3+ stack at 4–7% of turn ends.
  - Failed blitzes cost a median of 2 armies.
  - It doesn't gang up on the human: 31% of AI conquests come from seat 0 (fair 33%), and seat 0 wins 19–24%
    in 4p across maps, the same as the classic AI in an all-AI free-for-all (20.5%).
  - AI turns run a median of 5 fights (p90 12, max 30); the reel compresses them to ≤ ~7 s.
- The one weakness is spectacle: the AI almost never takes a near-even fight (0.1–0.7% of fights), so there's
  never an AI gamble to gasp at (folds into #2).

## Streamline (complexity that is only friction)
- **Draft territories**: worse fairness (2p 91% first mover) and +10 min. Cut it.
- **Full conquest as a peer length**: a mop-up tail, and half of 4p humans end up watching. Cut it, or put it
  under More with a concession button.
- **Quick vs Evening as they stand**: 2 rounds apart. Re-space them (#5).
- **Four standing bands and AI–AI understandings**: 79% of readings are wary or hostile, and understandings
  happen in 25% of 4p games and 2.5% of 3p games. Three bands, and drop understandings from the UI.
- **Free, always-accepted peace**: scarce or costly (#7).
- **The neutral seat as the 2p fairness fix**: once the opening-strike rule lands, it's optional flavour.
- **Per-click fight confirms on foregone fights**: smart occupy default plus an auto-armed chain (#6).
- **Personalities**: widen them (#2) or fold them into one AI. Today they're voice lines on identical play.

## Deepen (at most three additions)
A. **Visible threat: "needs N · holds a set"** plus an AI dogpile on a seat that can win next turn (#4). It
   gives the ending a visible run-up the table can respond to, at zero rules weight.
   - It beats *hold to win* (+30% length, measured), *sudden death* (the same tempo cost) and *public missions*
     (new rules to learn).
   - It is information, which the couch audience can read, rather than a rule they must be told.
B. **Capitals** (classic Capital Risk, reasoned, not simulated). Each seat names one of its dealt territories
   as its capital at setup (default: the most defensible, so "decide, don't ask"). Losing your capital costs
   you your next card. Holding every capital is an alternative Evening win.
   - It gives reinforcement a real tension (guard the capital or push), a target that stays put while
     continents churn every turn (#10), a comeback move (strike the leader's capital), and a final act the room
     can see ("Ochre holds three of four capitals").
   - It beats fog (breaks the glance test), fortifications and events (more weight, less story), and
     secret missions (invisible).
   - Size M–L: setup, win check, AI defend/target heuristic. Pay for it by cutting Draft, Full conquest and
     AI–AI understandings.
C. **Seat head start (+1 or +2 armies a turn), which also becomes the difficulty dial** (#3).
   - Measured: +1 → 39%, +2 → 52% win share for an equal player.
   - For friends of uneven skill this is the fairest dial, and it makes "Hard" mean something.
   - It beats the heuristic knobs, which top out at 33% (measured).

## Leave alone
- Progressive cards (the cap tested at 15 changed little, and they drive lead changes). Dice combat (the drama).
  Blitz to completion. Connected fortify (adjacent fortify only adds ~2 rounds and changes no balance:
  2p 71.5% vs 75.2%, 4p 22.8% vs 22.7%).
- 3–4p turn order (fair within CI). The AI's competence and its human-neutral targeting.
- Evening at 70% as the default goal: it ends at the decision point.
- AI turn pacing: the wait with AIs is ~10 s per round.

## Scripts and outputs (all in `artifacts/v6-audit/design/`)
| script | what | output |
|---|---|---|
| `lib.ts`, `util.ts` | harness: recorded games, hooks (init / override / post), table builders | — |
| `exp1-shape.ts [n] [maps]` | session shape, eliminations, waits, snowball, endings, seat-0 targeting, 4 maps × 2–4 seats × 3 presets | `exp1-out.md` (n=300/cell) |
| `exp2-firstmover.ts [n]` | first mover by seats + 7 candidate fixes, cause | `exp2-out.md`, `exp2-run.log` (n=1000/row) |
| `exp2b-setup.ts [n]` | first mover by setup/cards/fortify house rules | `exp2b-run.log` (n=600) |
| `exp3-decisions.ts [n]` | per-personality behaviour, AI blunder checks, progressive vs fixed cards, continent holds per map | `exp3-out.md` (n=300) |
| `exp4-endgame.ts [n]` | decided point, "within reach" window, missions on/off, difficulty | `exp4-out.md` (n=300) |
| `exp5-hold.ts`, `exp5b-hold-lower.ts` | hold-to-win at 70 / 65 / 60% | `exp5-run.log` (n=300–400) |
| `exp6-winturn.ts` | anatomy of the winning turn, set value by round | `exp6-run.log` (n=300) |
| `exp7-cards.ts` | card escalation caps via post-trade re-value | `exp7-run.log` (n=400) |
| `exp8-hard.ts`, `exp8b-handicap.ts` | Hard knob patches (runtime only), army handicap | `exp8-run.log`, `exp8b-run.log` (n=500) |
| `exp9-chains.ts` | attack chaining | `exp9-run.log` (n=200) |
| `exp10-peace.ts` | always-ask-peace policy | `exp10-run.log` (n=600) |
| stock `npm run sim 200` | baseline | `sim-classic-200.txt` |

Run any of them with `npx tsx artifacts/v6-audit/design/<script> [n]` from the repo root (each takes 10 s–10 min).
