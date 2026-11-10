# v6 audit — visual quality and art direction

Auditor lane: every still frame (board, armies, coasts/water/paper, colour, type, HUD chrome, screens, icons, map packs).
Branch v6 (= shipped v5), dev server :5304, Playwright + Metal, muted. 2026-11-10.

All paths are relative to the repo root. Shots at DSF 2 unless noted.

- My captures: `artifacts/v6-audit/visuals/shots/` (scripts `cap.ts`, `cap2.ts`, `cap3.ts` beside them)
- The repo's own sweep (screens.ts, DSF 1, 1440x900 + 1920x1080): `artifacts/v6-audit/visuals/sweep/`

Legend: **[seen]** = observed in a screenshot I looked at. **[code]** = inferred from source.
Severity: **P0** looks broken or unfinished · **P1** visible in every frame / every session · **P2** polish.

---

## 0. Verdict in one paragraph

The classic and True World boards at rest are genuinely handsome: the indigo paper, the four washes, the serif
continent labels and the hairline gold rule read as one restrained hand and are close to the touchstone
(`_claude/moodboard/chosen-silver-ink-board.png`). What keeps it from AAA is (1) the armies: the pieces are
tiny pins with a small numeral beside them, so the board reads as a political map, not a game board, and fails
the couch test on counts; (2) the printed continent outline, which is the single most visible line on the board
and is a pixel-quantised, aliased distance-field line that shows stair-steps, flat "tab" clips at the board edge
and a stray circle on Boston; (3) three of five map packs look like data (Italian Conquest's grey backdrop slab,
Boston's GIS polygons, label collisions on Rome/Italy/Boston); and (4) the chrome around the board (new-game
"More", card sheet, menu, victory) is a stack of flat rectangles with a cloudy fill, below the board's finish.
The ensō is used as the menu button, the turn marker, the title mark, the wild card, the app icon and the
splash, and at every size it reads as a loading spinner.

---

## 1. Ranked findings

### F1 · P0/P1 · Armies are too small to be the game (couch test fails on counts)
- [seen] `shots/1920-r6-rest.png`, `shots/r6-rest-25pct.png`, `shots/1920-crop-europe.png`: a 1-army stone is
  a ~10 px blot with a ~12 px figure; the numeral is a ~13 px cap-height Cormorant digit hung off the lower
  right. At 25 % you can find the one cannon (12) but cannot read any other count. Every territory under 5
  looks identical. Compare the touchstone (`moodboard/units-place.png`, `chosen-silver-ink-board.png`): a
  numeral inside a ~40 px ring is the dominant mark in each territory.
- [seen] Label collisions with the piece: "URAL" under the 12 stone (`shots/1920-r6-selected-crop.png`), "12+7"
  jammed at 1440 (`sweep/1440x900-03-place.png`), the 18/19 overlapping the cannon in the attack frames.
- [code] `src/render/tokens.ts:51-57` stone diameter 10 → 44 px (√n), `index.ts:2953` dminPx 10; numeral is DOM,
  `NUMERAL_MIN 18` css px (`tokens.ts:104-113`) but Cormorant's lining figures render small at that size.
- Fix (M): raise the floor (dmin ~22-24 px at 1920, ~18 at 1440), and put the numeral ON the stone as the
  primary mark (ivory, 600 weight, ~22-28 px, a dark painted ring/edge behind it), figure standing above/behind
  it. Keep √n growth for the stone. Re-tune the collision caps (`index.ts fitCaps ~2779-2913`). Files:
  tokens.ts (stoneK, numOffset, numeralPxFor), overlay.ts numeral layout, index.ts caps.

### F2 · P0 at close zoom / P1 at rest · The printed continent outline is aliased and clips
- [seen] `shots/zoomin-detail-hull.png` (crop of `shots/1920-zoom-in.png`): the ivory continent line across the
  Mediterranean is a stair-stepped pixel chain with a hard ivory core; the coast rim next to it is soft. At rest
  it reads as a vector diagram line looping around every continent, crossing the Black Sea/Med and Arabian Sea
  (`shots/1920-crop-europe.png`).
- [seen] Flat "tabs" where the halo meets the board's top edge: Greenland/Arctic at `shots/1920-crop-topstrip.png`
  (x≈555-865), also top of `boot-1200ms.png` and the title. On True World the top of the board is a row of
  scallops (`shots/1920-map-true-world-mid.png`).
- [seen] Modern Boston: a perfect empty circle of outline in the harbour (`shots/1920-map-modern-boston-start.png`
  at ~1135,460).
- [code] `src/render/ink.ts:670-760` builds the region from a closed EDT at field resolution (fieldW = inkW/2,
  `ink.ts:775`), marks outline *texels*, then `inkGlsl.ts:456-490 continentInk` reads an unsigned 8-bit
  distance (`k.r * CONT_DR`) — the line is only as smooth as the half-res texel set.
- Fix (M): store a signed, higher-precision distance to a smoothed iso-contour (marching squares on the closed
  mask → Chaikin-smoothed polyline → SDF bake at full field res, or render the outline as a ribbon mesh with the
  existing brush-pressure jitter). Clamp the halo inside the board rect *before* the closing so it never runs
  into the edge; drop enclosed micro-rings (extend the pool fill in ink.ts to rings of outline). Also lower its
  weight ~25 %: it currently outshouts the coasts it is meant to sit behind.

### F3 · P0 · Three map packs look like data, not paintings
- Italian Conquest [seen] `shots/1920-map-italian-conquest-start.png`: a large flat grey trapezoid slab behind
  the whole map (straight top edge, diagonal right edge) and a flat grey North Africa. Looks like a missing texture.
- Modern Boston [seen] `shots/1920-map-modern-boston-start.png`/`-mid.png`: GIS polygon edges with straight
  cuts, an island floating in empty ocean with no mainland context, labels far from their zones ("The
  Southwest" sits in open water), "The Harbour" label colliding with the coast, the circle artifact above.
- Roman Empire [seen] `shots/1920-map-roman-empire-mid.png`: the context land (Germania, Sahara) is a blurred
  grey ghost — atmospheric, but blurry against the crisp provinces; labels "Italia", "Illyricum", "Graecia &
  Asia" overlap coastline; the North African strip is double-outlined.
- Classic and True World [seen] look finished. True World is the best-looking board in the game.
- [seen] Map picker blurbs truncate with "…" on three of five tiles (`shots/1920-newgame-picker.png`).
- Fix (M per map): a per-pack "presentation" pass: (a) context land drawn through the same paper/coast shader as
  playable land at lower contrast (no flat grey fills, no blur); (b) a label placer that avoids coast and
  token boxes (reuse the token collision envelope); (c) Boston: simplify polygons with a curvature-preserving
  smoother, add the mainland as context, pull labels to zone centroids; (d) Italy: delete or paint the backdrop
  slab (maps/italian-conquest board.json decor layer). Two-line clamp or shorter blurbs in pack.json.
  Recommend hiding Boston and Italy behind a "beta" flag if v6 can't finish them.

### F4 · P1 · The ensō is overloaded and reads as a loading spinner
- [seen] Same open-ring mark as: menu button top right, the turn marker on the gold rule, the title lockup, the
  boot splash, the wild card face (`shots/cards-sheet-crop.png`), the victory crest, the app icon
  (`public/icons/icon-512.png`). In every still it looks like an activity indicator, especially top right.
- Fix (S-M): keep the ensō for exactly one meaning (the rule's "now" ring + the brand). Menu → three short
  brush strokes or the word "Menu"; wild card → its own glyph (all three unit figures, tiny); victory crest →
  winner's emblem in a closed ring. Close the gap on the rule's ring a bit so it reads as a brush circle, not a
  spinner (src/shared/enso.ts, ui/dom.ts ensoEl/setEnso, topstrip.ts:457, cards.ts).

### F5 · P1 · Whose turn is a 14 px underline
- [seen] `shots/1920-crop-topstrip.png`, `r6-rest-25pct.png`: the active seat is marked only by a filled ring and
  an underline under "John"; the bottom-left "John" with a brush swatch is tiny. At 25 % you cannot tell whose
  turn it is. Pillar 2 test fails on "whose turn".
- Fix (S): the active seat's ring at 1.4x with its name in ivory 600 and the others at 55 %; tint the gold rule's
  ensō or the line under the dock in the active seat's colour for the turn line's beat; or a faint seat-colour
  wash on the board vignette edge. (topstrip.ts, strip.ts, styles.css.)

### F6 · P1 · No board-side colour-blind backup
- [seen] `shots/cb-protanopia.png`: Vermilion (John) and Sage (Theo) collapse to two khaki greys a few L* apart
  (compare Brazil vs Greenland). `cb-tritanopia.png`: Vermilion and Ochre become dark vs light pink. The
  palette passes its ΔE 10 bar (palette.ts:15-21) but at a glance under the vignette they are close.
- [code] Emblems (triangle/circle/square/diamond) exist (palette.ts EMBLEM_PATHS) but appear only in the top
  strip; stones carry none.
- Fix (S-M): stamp the seat emblem small in the stone's edge or as the numeral ring's shape; optionally a
  per-seat hatch in the wash at very low contrast (ink.ts tile wash). Setting-gated if it feels busy.

### F7 · P1 · Chrome surfaces are flat rectangles below the board's finish
- [seen] Menu `sweep/1920x1080-09-menu.png`, rules `sweep/1920x1080-10-rules.png`, new game
  `shots/1920-newgame.png`, cards `shots/1920-cards-sheet.png`, victory `sweep/1920x1080-13-victory-scroll.png`:
  every sheet is a hard-edged rectangle with a cloudy "render clouds" texture and a drop shadow. No deckle, no
  fibre, no edge darkening; it reads as a web modal on top of a painting. The cards sheet floats at the bottom
  right and clips the "AUSTRALIA" label; the rules sheet's last lines are cut by the viewport with no fade.
- Fix (M): one paper-sheet component: subtle torn/deckled edge (SVG mask), paper fibre from the board's own
  texture (public/tex), edge-darkening, a softer contact shadow; dim the board under modal sheets by ~25 %.
  Cards: dock the sheet to the dock rule, centre it, give cards a painted face (territory silhouette in the
  card, figure, value) rather than hairline boxes.

### F8 · P1 · New game "More" breaks the seat rows
- [seen] `shots/1920-newgame-color.png`: after opening More, each seat row balloons: Human/AI stack vertically
  above and below the name, the name field shrinks to ~110 px, and the colour popover (a plain dark rectangle)
  covers the Human/AI words.
- Fix (S): put difficulty/personality on a second line under the seat; keep Human / AI inline; give the
  colour popover the paper-sheet treatment (newgame.ts seat layout, styles.css seat grid).

### F9 · P1 · Dice are the one lit 3D object and their tray fights the coast
- [seen] `shots/1920-dice-crop.png`, `sweep/1920x1080-06-dice-verdict-puff.png`: rounded, shaded bone cubes in a
  thin ellipse hairline over the Arctic coast. The ellipse crosses coast and continent lines; the losing dice
  greying with a splat is good. The dice in "How to play" are a third style (flat outline squares).
- Fix (M): paint the dice like the stones (flat, an edge, a painted shadow), tray as a soft paper pool (a
  darkened wash under them, no hairline ellipse), and place the tray in open sea away from coasts. dice.ts.

### F10 · P1 · Title screen is a dimmed in-game board, not a title
- [seen] `shots/1920-title.png`, `shots/1920-title-continue.png`: wordmark is plain Cormorant small caps; the
  continent labels with "+5" bonuses show through and collide ("Europe +5" under "War", "Africa +3" under
  "How to play"); Greenland is cut at the top edge. With a save, the Continue ring stretches to a huge ellipse
  and the save thumbnail is a hard rectangle butting the ring.
- Fix (M): a title-specific board state (no labels, no bonuses, slow camera drift, lighter mist), a lettered
  wordmark (custom-kerned, maybe a brushed W and T, gold hairline rule), Continue as a word with its thumbnail
  as a small vignetted plate beside it, not in the ring. title.ts, render index.ts attract mode.

### F11 · P1 · Splash-to-title is a jump cut
- [seen] `shots/boot-700ms.png` → `shots/boot-1200ms.png`: the splash lockup (44 px, centred) is replaced by the
  title lockup (larger, 130 px higher) with no shared motion; the splash uses the old brass `#c9a961`
  (index.html:83-87) while the HUD gold is `#cfa66b`. On a warm dev load the title arrived at ~1.2 s; cold
  production loads were not measured.
- Fix (S): make the splash the title's lockup at the same size/position so the board fades in under it; use the
  one gold token. Clean the remaining `rgba(201,169,97,…)` (styles.css:33-34, 272, 372-373, 616-617, 666-667).

### F12 · P1 · Unexplained glyph soup under the seats
- [seen] `shots/1920-map-true-world-mid.png`, `-roman-empire-mid.png`: under each seat ring there are tally
  strokes "|||||||", small drop glyphs and a card rectangle with a count ("▯3"). Nothing on screen says what the
  tallies are; at a glance it looks like debug output. The card glyph is a default-looking outlined rectangle.
- Fix (S): one glyph per idea, drawn in the brush style (a small card back), with the tallies replaced by a
  number or removed (topstrip.ts:367 and its tally render).

### F13 · P2 · Board layout and camera framing
- [seen] Attack camera cuts "NORTH AMERICA" to "ORTH AMERICA" and Alaska off-screen (`sweep/1920x1080-05-stroke-armed.png`).
  Closest zoom puts a huge "AFRICA · +3" label under the dock words (`shots/1920-zoom-in.png`). The hover card
  (territory name, "Held since the deal") overlaps Alaska at 1440 (`sweep/1440x900-03-place.png`).
- Fix (S): clamp camera so labels stay inside the safe rect; fade continent labels out above a zoom threshold;
  give the hover card a panel or move it into the dock's line.

### F14 · P2 · Valid targets read weakly
- [seen] `shots/1920-r6-selected-crop.png`: after selecting Ural, China lifts clearly but Siberia barely changes;
  the rest dims slightly. The touchstone has a gold edge glow on the selected territory; here the selection is
  an ivory outline only and the board carries no gold until a stroke.
- Fix (S): targets get a thin ivory rim plus a 10 % lift; non-targets dim a little more. index.ts selection
  lift; inkGlsl coastColor glow.

### F15 · P2 · Victory has no hero moment
- [seen] `sweep/1920x1080-12-victory-board.png` (one-colour world, good) then `-13-victory-scroll.png`: a
  rectangle with centred lines and a two-line chart; the title is the same weight as the menu title.
- Fix (M): a lettered "John holds the world" over the board with the winner's colour soaking the gold rule, the
  recap as a second beat. victory.ts.

---

## 2. Map packs at a glance

| Pack | At rest | Mid-game | Verdict |
|---|---|---|---|
| Classic | `1920-map-classic-start.png` | `1920-map-classic-mid.png`, `1920-late-crafted.png` | Finished. Halo line and tiny pieces are the only flaws. |
| True World | `1920-map-true-world-start.png` | `1920-map-true-world-mid.png` | Best looking. Top-edge scallops. |
| Roman Empire | `1920-map-roman-empire-start.png` | `1920-map-roman-empire-mid.png` | Nearly there: label collisions, blurry context land. |
| Italian Conquest | `1920-map-italian-conquest-start.png` | `-mid.png` | Looks unfinished (grey slab). |
| Modern Boston | `1920-map-modern-boston-start.png` | `-mid.png` | Looks like data (GIS edges, circle artifact, stray labels). |

2/3/4 players: `1920-classic-2p-r5.png` (game ended early: victory sheet), `1920-classic-3p-r5.png`,
`1920-classic-4p-r14.png`. With 3 players washes stay clear; the board is legible as territory, not as armies.

## 3. Zoom extremes and couch read

- Full out `shots/1920-zoom-out.png`: holds up; tokens become specks.
- Closest `shots/1920-zoom-in.png`: wash texture and figures hold up nicely; the halo line and coast rim show
  stair-steps (`zoomin-detail-hull.png`); a giant continent label meets the dock.
- 25 % couch test (`shots/r6-rest-25pct.png`): who holds each continent YES (washes), biggest army YES (only
  because 10+ becomes a cannon), whose turn NO, any count under 10 NO.

## 4. Colour and colour blindness

`shots/cb-deuteranopia.png`, `cb-protanopia.png`, `cb-tritanopia.png`, `cb-achromatopsia.png`. The washes stay
separable by lightness in deutan/tritan; protan Vermilion vs Sage is the weakest pair on the board and there is
no shape cue on the board itself.

## 5. Gold discipline and hierarchy

The one gold is well kept on the board: the rule, the active segment, the primary button ring, dice pairing
arcs during a roll. Nothing competes. The eye lands first on the board's warm washes (good), second on the
top-left seat rings (fine), and only third on the line above the rule. Type scale is consistent
(Cormorant 11/14/18/24/40); weights are consistent. Orphans: two golds (`#c9a961` vs `#cfa66b`), the tally glyphs,
a default-looking hairline slider in Place (`sweep/1440x900-03-place.png`), the "Reset view" link top right.

## 6. Depth and material — what to add, what to leave

Present: paper grain on land, soft coast rim, mist clouds in the ocean, wave glyphs, vignette. Missing / flat:
the ocean is one flat indigo with blotches (no depth gradient toward coasts, no granulation), land has no
relief, sheets have no paper edge.

Fit the style (do): pigment granulation in washes at close zoom; a darker "shallow water" band hugging coasts;
very faint relief shading on mountain ranges (one lamp, upper left); a single compass rose or cartouche in a
board corner per map pack (only on the title or at full zoom-out); deckled sheet edges; a lettered wordmark.
Clutter (don't): sea monsters, ships, rhumb lines everywhere, seals, ornamental borders on every panel.

## 7. First 5 seconds

`shots/boot-250ms.png` (blank indigo), `boot-700ms.png` (splash fading in), `boot-1200ms.png` (title, the
ensō drawing in), later frames stable. Calm and quick; the only flaw is the lockup jump (F11) and the
spinner-like ensō.

## 8. Already excellent — don't touch

- The four-wash palette and the indigo paper (classic/True World at rest).
- The unit figures (soldier/rider/cannon) — crisp, consistent, the right ivory.
- Continent labels in tinted serif small caps on the sea.
- The gold rule with its moving underline: disciplined, the HUD's signature.
- Victory board: the whole world in one wash is a strong image.
