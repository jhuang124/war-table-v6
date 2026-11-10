# War Table v6 · the plan (2026-11-10)

Six auditors played and measured v5 (desktop UX, phone/tablet, game feel, visuals, design/balance, tech).
Their reports are in `_claude/v6/audit/`. This is what I'm doing with them.

## What the audit says, in one paragraph

v5 is calm, handsome and fast to respond. Its problem is that **nothing lands**. A game-winning capture
plays exactly like a routine roll, the dice verdict arrives after half a second of dead air, armies shrink
and teleport when they move, the win is a text sheet with Rematch below the fold, and the ending arrives as
a card sweep nobody saw coming. Around that: the board fails its own couch test (army counts are 10–14 px),
phones mis-pick small territories up to a third of the time, two-player games are decided by who moves
first (75.6%, n=1000), the three AI personalities play identically, and a new player waits 12 seconds and
loses territory before their first click.

So v6 is not "more". The calm stays. The decisive moments get weight, the board gets readable, and the
rules get fair.

## The bets, ranked

1. **Decisive moments land** (feel). One grammar, used only for captures, continents, knockouts and the
   win: the verdict arrives the instant the dice settle, pair by pair; a deciding roll gets a breath of
   hit-stop, a small camera push and the flood bursting from the impact; armies travel with their weight
   and land; a continent taken re-inks territory by territory; the winner's ink sweeps the board. Routine
   rolls stay as quick as they are. No screen shake, no particles, no floating numbers.
2. **Readable from the couch and the thumb** (visuals + mobile). Army count becomes the hero mark on a
   bigger stone; continent labels take their holder's colour; the active seat is unmistakable; the HUD
   scales with the screen; the jagged continent outline is redrawn smooth. On phones: taps favour legal
   targets, drags pan unless they start an attack, portrait gets a whole-world view, numbers are 16 px+.
3. **A fair, legible game** (rules). In two-player games the first player doesn't attack on turn one
   (75.6% → 48.2% in simulation). A human always takes the first turn. Difficulty becomes an honest dial
   (extra armies per turn, said in plain words). The three AI personalities are widened until you can
   tell them apart. The table always sees who is close to winning and what set they hold, and the AIs
   turn on a seat that can win next turn. Peace stops being free.
4. **The first minute and the last** (UX). First turn: "You're Vermilion", your territories pulse, you
   move first. Last turn: winner first, replay skippable, Rematch always on screen, honest copy for a
   called game. In between: Undo survives until the first roll, the fight line says what a roll cost,
   the hover card follows the pointer, the seat strip explains itself, keyboard gets real support.
5. **One new rule: capitals** (depth). Each seat gets a capital. It pays its holder every turn, and
   taking one is a named event the table reacts to. It gives placement a reason, the map a fixed target
   while continents change hands, and the loser a comeback move. **Gated:** built in the engine and
   simulated first. It ships on by default only if game length, first-mover advantage and snowballing
   stay inside the gates below; otherwise it ships as a house rule under More, or not at all.
6. **Everything around the board matches the board** (finish). Splash and title become one lockup in
   the right gold, the title stops being a dimmed game board, sheets get one paper material, the ensō
   stops doubling as a menu button, the New game fold stops breaking its rows, the three unfinished map
   packs get their worst flaws fixed.
7. **Safe to ship beside v5** (tech). Saves and offline caches are namespaced per version (today v4, v5
   and a v6 would overwrite each other's saves on the same origin), a bad save can't brick Continue, the
   first visit stops downloading everything twice, the board stops burning the GPU at rest.

## What I'm cutting, and why

- **Rebuilding the dice as flat painted objects.** The pour is one of the best-feeling things in the
  game. They get a fixed tray spot and owner tint instead.
- **Hold-to-win, fog, events, forts, alliances.** Simulated or reasoned: each costs more rules weight or
  game length than it returns. Hold-to-win alone adds 30% to game length.
- **The hand-off cover.** John removed it on purpose in v5.1. It stays gone.
- **Draft setup** (worsens first-mover advantage to 90% and adds ten minutes) and **Full conquest as a
  headline option** (half of humans in a four-player game get knocked out and watch). Full conquest
  moves under More.
- **Hiding Italy and Boston.** The visuals auditor suggested it. They're the owner's maps; they get
  their worst flaws fixed instead.
- **Lazy-loading map packs, painted card faces, iOS haptics.** Real but low return for this release.

## Gates

- Tempo holds: a single roll ≤ 1.25 s, a blitz ≤ 3.0 s, an AI turn median ≤ 6 s. Hit-stop only on
  decisive rolls and never blocks input.
- Capitals default-on only if, against the same build without them (n ≥ 500 per seat count): median
  rounds within ±1.5, first-mover advantage within ±3 points, round-5 leader win rate up by no more
  than 5 points.
- Two-player first-mover win rate lands between 45% and 55%.
- Typecheck, unit tests and the full e2e suite pass; budgets that move are moved on purpose and listed.
- A reviewer who hasn't seen the build passes the couch glance test at 1920×1080 shrunk to 25%, and a
  phone turn in portrait and landscape.

## Build order

**Phase 1, four builders in parallel, each in its own worktree with its own files:**
- **Engine**: rules, AI, presets, simulation (`src/engine`, `src/game/presets.ts`).
- **Board and pieces**: stones, counts, outline, continent tint, marches, map packs (`src/render`
  tokens/overlay/ink/continents, `maps/`).
- **Fights, motion, camera, touch, sound**: dice, verdict, decisive grammar, blitz, camera framing,
  touch picking, audio (`src/render` dice/fx/anim/camera/index, `src/audio`).
- **Screens and HUD**: scaling, seat strip, title, victory, sheets, New game, service worker
  (`src/ui`, `index.html`, `public/`).

**Phase 2, one integrator** on the merged tree: the controller (first turn, Undo, fight copy, keyboard,
saves, AI turn pacing, threat line, capitals wiring), then the e2e suite brought up to date.

**Phase 3:** full test run on a quiet machine, a fresh-eyes review of screenshots and a played game, a
fix round, then deploy to `jhuang124/war-table-v6` (the same one-repo-per-version pattern as v3–v5).
