# v6 audit: first run and desktop UX/UI (1440x900, 1920x1080)

Auditor lane: first-run experience and UX/UI at laptop / TV distance. Played on the real board and HUD
through Playwright with real pointer events (dev server :5301, muted Chromium, Metal ANGLE). Screenshots:
`artifacts/v6-audit/ux-desktop/*.png` (97 frames). The driver is `artifacts/v6-audit/ux-desktop/driver.ts`.

**What I played:** cold load, title, New game (every row, More fold, colour picker, missions + place-your-own),
a 1-human vs 3-AI Classic game at real speed (place, mis-clicks, Roll x2, capture + occupy, drag-to-attack,
Blitz, fortify, end turn, watched a full AI round), cards, the seat strip, peace ask, menu, How to play,
Settings (+ More, Text size TV), save/reload/Continue, autoplay to round 7, a save-edited late game
(round 14, 41-army stacks, forced 5-card trade, big blitz), End game now, replay, victory scroll, Full stats,
Rematch, a 2-human + 1-AI hot-seat handoff at 1920x1080, Undo mid-place, keyboard (Enter/Space/Esc/arrows),
a forced elimination with card capture. **Tagging:** [played] = seen on screen; [code] = inferred from source.

## Ranked findings

### 1. P0 · The first-time player's first turn is a 12-second wait, and they've already lost ground [played + code]
Seat 1 is not first: the first player is random (`src/engine/setup.ts:195`). In my first game, I clicked Start
and watched Slate, Ochre and Sage each take a turn (12.5 s to idle). Two of my territories were taken
before I could act (10 → 8 territories; `09-start-3000.png` → `11-my-turn.png`). Nothing says so: the round-1
recap is suppressed (`controller.ts:1679`, `ev.round >= 2`), so the first thing the new player sees
is a board that has already changed. Their first frame says what to do ("Place 3 armies · click a
territory") but not "you're red".
**Fix (S):** on a seat's first turn, the turn line says "You're Vermilion · Place 3 armies" and
your territories get a one-time ink pulse. Also: when a human seat exists and it's round 1, the first human
moves first (or at least show a 1-line "Slate goes first" on Start). `setup.ts` (first player), `controller.ts` (turn banner).

### 2. P0 · Missions are effectively invisible on a laptop/TV [played + code]
With Missions on, your mission shows only while you **press and hold your own seat ring**
(`src/ui/hud/topstrip.ts:173-192`; flashed 2.4 s, `controller.ts:3614-3626`) or on the hand-off cover,
which is off by default on laptops. Nothing on screen says this exists. Verified: the line reads
"Vermilion must hold 24 territories" only while the mouse is held down (`79-mission-press.png`); the
setup summary promises "or a secret mission wins" (`06-missions-on.png`).
**Fix (S/M):** show the mission once on your first turn under the turn line, and keep a quiet persistent
"Mission" entry (e.g. a third line in the Cards panel: "Your mission: hold 24 territories · you hold 11").
`controller.ts`, `src/ui/hud/*` cards panel.

### 3. P0 · The victory screen hides Rematch below the fold at 1440x900, after an unannounced ~15 s replay [played]
After End game, the screen plays a round-by-round replay ("Round 4 · John took Europe") with no "who won"
first and no visible skip (`65-victory-2500.png`, `65-victory-9000.png`, `65-victory-14000.png`). Then the
scroll opens; **Rematch's top edge is at y=888 of 900** (`66-victory-scroll.png`), so you can see it only after
scrolling (`67-victory-scrolled.png`). The SOUL moment is "someone demands a rematch".
Also, a called game reads "Ochre holds the world" with 16 of 42 territories (`controller.ts:4760`).
**Fix (S):** headline the winner first ("Ochre wins" over the replay); add a small "Skip" or let any click
skip (say so); lay out the scroll so the button row is pinned at the bottom of the viewport
(sticky footer); called games say "Ochre leads · called in round 14". `src/ui/screens/victory.ts`, `controller.ts:4760`.

### 4. P1 · Nothing scales for the couch or the TV [played]
The HUD is fixed px: the line is 24 px at 1440 and at 1920 (`83-1080-laptop-text.png`); Text size TV
only makes it 27 px. Seat names are about 15 px, personality and voice lines about 14 px italic, card counts
about 11 px. Board army numerals are about 14 px tall even in TV mode, and a 1-army piece is about 10 px
(`45b-tv-armies-zoom.png`). Pillar 2's glance test ("who holds Asia, where is the biggest army") fails from
a couch: 41 vs 34 are the same cannon (`56-europe-zoom.png`), and continent labels never show the holder.
**Fix (M):** scale the HUD with `min(vw, vh)` (clamp), make Text size also scale board numerals and stone
sizes, and tint a continent's label in its holder's colour (plus "· Sage" after the bonus). `src/ui/uiScale.ts`,
`src/ui/styles.css`, `src/render/continents.ts`, the piece/label code in `src/render`.

### 5. P1 · The seat strip carries the most hidden UI in the game [played]
The strip under each ring has tally marks, coloured ticks, dots and card glyphs (`47-seatstrip-zoom.png`):
"has taken 8 from you", a grudge, holds a continent, card count. Their only explanation is native `title`
tooltips. **Peace** is reachable only by clicking an AI's ring ("tap to ask for peace" is in a title
attribute), which reveals an "Ask" button (`49-click-ochre.png`). Hovering a seat shows nothing (`48-seat-hover.png`).
**Fix (M):** a hover card for seats like the territory card (name, territories, armies, cards, continent,
standing, "Click to ask for peace"); drop the tally marks (or label them "took 8 of yours"). `src/ui/hud/topstrip.ts`.

### 6. P1 · The hover card is in the far top-left corner and overlaps the map [played]
The territory card always renders at (24, 100), about 700 px from the cursor, on top of Alaska's piece
(`12-hover-mine.png`, `13-hover-enemy.png`, `28-drag-mid.png`). Laptop players look at the cursor and never see it.
**Fix (S):** anchor it near the pointer (offset, flip at edges), or dock it into the line area. `src/ui/hud/*`.

### 7. P1 · Fight feedback hides the cost and the dice owner [played]
The dice tray changes position between fights: at the bottom over Africa (`20-roll-700.png`), at the top
over Greenland and the seat strip (`62-big-blitz-end.png`), and over Russia (`80-elim-1.png`). Attacker and
defender dice are both ivory and are told apart only by grouping. After a lost roll the line goes back to
"99% · almost sure" with no "you lost 1" (`21-roll-result.png`). A 49-v-27 blitz ends with "Egypt captured"
and never says it cost 27 armies (`62-big-blitz-end.png`). Territory labels sit on top of their own pieces
during fights ("MIDDLE EAST" over the stone, `19-attack-armed.png`).
**Fix (M):** one fixed tray position (e.g. above the line); tint the defender's dice or put the owner's name under
each group; the result line becomes "Lost 1 · 6 left" / "Egypt captured · cost 27". `src/render/dice.ts`, `controller.ts` fight copy.

### 8. P1 · Undo disappears exactly when you need it [played]
Undo exists between partial placements (`Undo · Place 3`), but placing your last army auto-advances to
Attack with no undo (`18-after-place.png`). The most common mistake, all 3 on the wrong territory, cannot be undone.
**Fix (S):** keep Undo on the Attack dock until the first roll; or don't auto-advance on the last army
(the gold Attack segment already says what's next). `controller.ts` reinforce→attack transition.

### 9. P1 · Setup's More fold breaks the seat rows and hides the AI choice [played]
Opening More re-flows every seat row: Human/AI stack vertically and the name field shrinks to about 110 px
(`05-more-seats.png`). Difficulty and personality appear only there. Rules toggles are hairline circles
whose on/off state is barely distinguishable (`04-more.png` vs `06-missions-on.png`). "~15–20 min" renders
as "-15–20 min" in Cormorant, so it reads as a negative number (`03b-length-zoom.png`). Map descriptions are cut mid-word ("straits and…").
Card sets "Growing 4, 6, 8, 10 …" vs "Fixed 4 · 6 · 8 · 10" read as the same thing.
**Fix (S):** keep the seat row on one line (difficulty as a compact "Normal ▾" chip on AI rows, always
visible; personality = "Any" by default and fold it away per SOUL "just randomize"); use "about 15–20 min";
toggles get a filled state and an "On/Off" word; Fixed → "4 · 6 · 8 · 10 by symbol". `src/ui/screens/newgame.ts`.

### 10. P1 · Keyboard support is three keys [played + README]
Enter, Space and Esc work. Arrows, +/−, digits, Z/Backspace (undo) and segment hotkeys do nothing (count stayed at 15
after ArrowLeft/ArrowDown/−). Esc means "back out a step, then menu", so a player mashing Esc to cancel
ends up in the menu (it happened to me twice, `40-scrim.png`). There is no `?` help.
**Fix (S/M):** ←/→ and −/+ for the count, digits to type a count, Z = undo, A/F/E for track segments, `?` opens How to play;
Esc never opens the menu while something is selected or armed. `controller.ts` handleKey.

### 11. P2 · Hot-seat handoff is a 20 px line change [played, 1920x1080]
Ana → Ben: the turn line becomes "Ben's turn · 4 armies" and the ring brightens (`74-handoff-0.png`,
`75-ben-turn.png`). On a laptop across the table that's easy to miss. SOUL: "Priya knows it's her turn before anyone says so."
**Fix (S):** a 1-second, full-width ink wash of the incoming colour along the gold rule, plus the name at about 2x for
the first second (no modal). `src/ui/hud/*`, `styles.css`.

### 12. P2 · The recap line is stale [code + played]
Round-1 losses are never cleared because of the `round >= 2` guard (`controller.ts:1679-1682`). In round 2, `ui().recap` said
"Slate took North Africa, Ochre took Yakutsk", but I had retaken North Africa in round 1.
**Fix (S):** clear `meta.recap[player]` on every human turn start, and show round-1 losses on the first turn (finding 1).

### 13. P2 · Small information gaps [played]
- Card-territory +2 bonus on trade appears silently (Great Britain 6→8, `57-trade-500.png`); say "+2 on Great Britain (your card)".
- The Cards button exists only in Place, so you can't check your hand mid-turn (after capturing Slate's cards I held 5 with no button).
- Occupy shows a bare "5" with no hint it's clickable and no "Middle East keeps 1" (`24-after-roll2.png`).
- The reinforcement breakdown ("8 territories +3 · Europe +5") is 13 px italic and shows only once.
- The red rings on territories (loser rings) are never explained.
- No first-game guidance: Title → New game → Start → playing in 2 clicks (good), but "How to play" is never offered.
- README says "Text size · TV on the title screen". It's inside Settings.

### 14. P2 · Northern Europe 6 showed a dot instead of a rider [played, unconfirmed]
After a save-edit, Northern Europe 6 rendered a dot instead of a rider, twice in a row (`56-europe-zoom.png`, `56b-europe-zoom2.png`).
It may be an artefact of my state injection; worth a 10-minute check by the art/tech auditor.

## Already excellent, don't touch
- **The one line.** It is always right and always specific: "That's Slate's · click one of your territories",
  "Place your 3 armies first", "Nowhere to go from Scandinavia", "Finish moving armies into Egypt first",
  "Scandinavia → Ukraine · 99% · almost sure · knocks out Slate". This is better than most commercial digital board games.
- **Time to play.** From the title, 2 clicks start a sensible game, and the setup summary line ("Territories dealt at random · armies placed for you · first to 30 territories wins") is a model of "decide, don't ask".
- **Affordances on the board.** The place preview ("4 +3"), fortify reach highlighting with the dotted path (`34-fortify-to.png`), and the dimming of non-involved territories while an attack is armed.
- **Drag-to-attack with a mouse.** It feels natural, and the stroke only arms (`28-drag-mid.png`).
- **Save/resume.** Continue carries "Round 7 · John vs 3 AI" and a thumbnail, and you're back in under 2 s; How to play is concise and correct.

## If I could only change three things
1. **Make the first 60 seconds yours.** You go first (or are told who is), are told your colour, and see what you lost (findings 1 and 12).
   A new player's first impression decides whether a laptop game gets a second game.
2. **Scale the HUD and the numerals for the couch, and show continent holders** (finding 4).
   The game's own pillar is "readable from the couch", and today at 1920x1080 it reads like a 1440 laptop UI shrunk onto a TV.
3. **Fix the end: winner first, a skippable replay, Rematch pinned on screen** (finding 3). It's a few hours of work,
   and it protects the moment SOUL is built around ("someone demands a rematch").

Missions (finding 2) would be in the top three if it were on by default. It's a P0 only for the people who turn it on,
but for them the game is broken.

## Notes and timings
- AI round (3 AIs, Watch): about 11 s; a single AI turn is about 3.5 s. A blitz of 49 v 27 takes 2.4 s. A single roll is 2.4 s to idle.
- Start → first human input (human not first): 12.5 s.
- Console: only the `maps/test-twelve has no board.json` warning on every load (dev noise; it should be silenced in prod).
