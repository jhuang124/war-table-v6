// v6 audits on the real board + HUD (logic lane, instant speed; the replay part runs one page at real speed):
//   A  quiet opening (2 players): the first turn's line names the colour and says no attacks; Attack is refused
//      with its reason and never recommended; Place → Fortify → End; the second player can attack
//   B  a person moves first, even from the third seat, and the first line names their colour
//   C  Undo after the last placement; Undo in Attack until the first roll; Esc cancels, then (not mashed) the menu
//   D  the threat line on a seat that can win next turn (a rigged save), and none on one that can't
//   E  capitals: off by default; switched on, every seat has its mark and the breakdown says "capital +1"
//   F  the victory sheet keeps Rematch on screen at 1440×900 and 390×844; a key skips the replay
//   G  a corrupted save doesn't brick Continue; saves and settings live under risk3d.v6.*
import { ART, check, clearStorage, clickBtn, clickT, finish, idle, loadScenario, open, place, rendered, scenario, seg, state, ui, type Ctx } from './lib';
import type { GameState, TerritoryId } from '../../src/engine';

const results: string[] = [];
const allErrors: string[] = [];
const ctxs: Ctx[] = [];

async function fresh(viewport?: { width: number; height: number }, query = ''): Promise<Ctx> {
  const c = await open(query, viewport);
  ctxs.push(c);
  await clearStorage(c.page);
  await c.page.reload();
  await c.page.waitForFunction(() => window.__risk?.ui().screen === 'title');
  return c;
}

const own = (s: GameState, p: number) => (Object.keys(s.territories) as TerritoryId[]).filter((t) => s.territories[t].owner === p);

async function humanTurn(page: Ctx['page'], seat: number, timeout = 30_000): Promise<GameState> {
  await page.waitForFunction(
    (p) => {
      const s = window.__risk.getState();
      return !!s && s.currentPlayer === p && s.phase.kind === 'reinforce' && window.__risk.isIdle();
    },
    seat,
    { timeout },
  );
  await rendered(page);
  return (await state(page))!;
}

// --- A · quiet opening, end to end with two people ---------------------------------------------------------
{
  const { page } = await fresh();
  await page.evaluate(() =>
    window.__risk.newGame({
      players: [
        { name: 'Vermilion', color: 'crimson', kind: 'human' },
        { name: 'Sam', color: 'cobalt', kind: 'human' },
      ] as never,
      seed: 61,
    }),
  );
  await page.waitForFunction(() => window.__risk.getState()?.phase.kind === 'reinforce', null, { timeout: 30_000 });
  const first = (await state(page))!.firstPlayer;
  const second = 1 - first;
  const who = (p: number) => (p === 0 ? "You're Vermilion" : "Sam · you're Slate");
  const s0 = await humanTurn(page, first);
  const n0 = s0.phase.kind === 'reinforce' ? s0.phase.remaining : 0;
  const u0 = await ui(page);
  check(s0.round === 1 && s0.turn === 1, `A the game opens on turn 1 (round ${s0.round}, turn ${s0.turn})`, results);
  check(u0.line === `${who(first)} · place ${n0} · no attacks this turn`, `A first line names the colour and the quiet opening: "${u0.line}"`, results);
  const mine = own(s0, first);
  const enemy = (Object.keys(s0.territories) as TerritoryId[]).find((t) => s0.territories[t].owner === second)!;
  await place(page, mine[0]);
  await idle(page);
  const u1 = await ui(page);
  check(u1.line === 'No attacks on the opening turn · fortify or end your turn', `A all placed: "${u1.line}"`, results);
  check(u1.recommended !== 'attack' && (u1.recommended === 'fortify' || u1.recommended === 'endTurn'), `A the recommended step skips Attack (${u1.recommended})`, results);
  // C · Undo survives the last placement (it lasts until the first roll)
  check(u1.buttons.includes('Undo'), `C Undo after the last placement (buttons ${u1.buttons.join(' / ')})`, results);
  await clickBtn(page, 'btn-undo');
  await idle(page);
  const sU = (await state(page))!;
  check(sU.phase.kind === 'reinforce' && sU.phase.remaining === n0 && sU.territories[mine[0]].armies === s0.territories[mine[0]].armies, `C Undo takes the placement back (${sU.phase.kind === 'reinforce' ? sU.phase.remaining : '?'} to place)`, results);
  await place(page, mine[0]);
  await idle(page);
  // Attack is refused with its reason, on the track and on the board
  await seg(page, 'attack', true);
  await page.waitForTimeout(150);
  const sA = (await state(page))!;
  const uA = await ui(page);
  check(sA.phase.kind !== 'attack', `A the Attack segment doesn't open Attack (phase ${sA.phase.kind})`, results);
  check(/No attacks on the opening turn/.test(uA.line), `A the refusal says why: "${uA.line}"`, results);
  const ex = await page.evaluate((t) => window.__risk.explain(t), enemy);
  check(!ex.ok && /opening turn/i.test(ex.text), `A explain(${enemy}): ${ex.code} "${ex.text}"`, results);
  const track = uA.track.join(' ');
  check(!/current:attack/.test(track), `A the track never stands on Attack (${track})`, results);
  // Place → Fortify → End
  await seg(page, 'fortify');
  await idle(page);
  const sF = (await state(page))!;
  check(sF.phase.kind === 'fortify', `A Place → Fortify (${sF.phase.kind})`, results);
  await seg(page, 'endTurn');
  // --- the second player can attack
  const s1 = await humanTurn(page, second);
  const n1 = s1.phase.kind === 'reinforce' ? s1.phase.remaining : 0;
  const u2 = await ui(page);
  check(u2.line === `${who(second)} · place ${n1} armies`, `A the second person's first line: "${u2.line}"`, results);
  const sam = own(s1, second);
  await place(page, sam[0]);
  await idle(page);
  const u3 = await ui(page);
  check(u3.recommended === 'attack' || u3.line.startsWith('All placed'), `A after placing, Attack is next: "${u3.line}" (recommended ${u3.recommended})`, results);
  await seg(page, 'attack');
  await idle(page);
  const s3 = (await state(page))!;
  check(s3.phase.kind === 'attack', `A the second player reaches Attack (${s3.phase.kind})`, results);
  // pick a source that can attack: try Sam's territories until the line says "Attack from"
  let src: TerritoryId | null = null;
  for (const t of [sam[0], ...sam.filter((x) => x !== sam[0])]) {
    if (s3.territories[t].armies < 2) continue;
    await clickT(page, t);
    await page.waitForTimeout(80);
    const u = await ui(page);
    if (/^Attack from |→/.test(u.line)) {
      src = t;
      break;
    }
  }
  const uS = await ui(page);
  check(!!src, `A the second player can arm an attack: "${uS.line}"`, results);
  const targets = src ? await page.evaluate((f) => { const s = window.__risk.getState()!; return Object.keys(s.territories).filter((t) => s.territories[t as never].owner === f); }, first) : [];
  let legal = 0;
  for (const t of targets) if ((await page.evaluate((x) => window.__risk.explain(x as never), t)).ok) legal++;
  check(legal > 0, `A explain() allows ${legal} attack target(s) on turn 2`, results);
  // C · Undo in Attack until the first roll
  check(uS.buttons.includes('Undo'), `C Undo still offered in Attack before a roll (buttons ${uS.buttons.join(' / ')})`, results);
  // C · Esc cancels first, a mashed Esc doesn't open the menu, a later one does
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  const sel1 = await page.evaluate(() => document.querySelector('[data-testid="pause"]') !== null);
  const uE = await ui(page);
  check(!sel1 && !/^Attack from |→/.test(uE.line), `C Esc cancels the selection, no menu ("${uE.line}")`, results);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  const mashed = await page.locator('[data-testid="pause"]').isVisible().catch(() => false);
  check(!mashed, 'C an Esc mashed right after the cancel does not open the menu', results);
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  const menu = await page.waitForSelector('[data-testid="pause"]', { state: 'visible', timeout: 2000 }).then(() => true, () => false);
  check(menu, 'C with nothing to cancel, Esc opens the menu', results);
  await page.screenshot({ path: `${ART}/v6-quiet.png` });
}

// --- B · a person moves first, from the third seat ---------------------------------------------------------
{
  const { page } = await fresh();
  await page.evaluate(() =>
    window.__risk.newGame({
      players: [
        { name: 'Slate', color: 'cobalt', kind: 'ai', difficulty: 'normal' },
        { name: 'Ochre', color: 'amber', kind: 'ai', difficulty: 'normal' },
        { name: 'John', color: 'crimson', kind: 'human' },
        { name: 'Sage', color: 'emerald', kind: 'ai', difficulty: 'normal' },
      ] as never,
      seed: 62,
    }),
  );
  await page.waitForFunction(() => {
    const s = window.__risk.getState();
    return !!s && s.phase.kind === 'reinforce' && window.__risk.isIdle();
  }, null, { timeout: 30_000 });
  const s = (await state(page))!;
  const u = await ui(page);
  check(s.players[s.currentPlayer].kind === 'human' && s.turn === 1, `B the person moves first (seat ${s.currentPlayer}, ${s.players[s.currentPlayer].name}, turn ${s.turn})`, results);
  const n = s.phase.kind === 'reinforce' ? s.phase.remaining : 0;
  check(u.line === `John · you're Vermilion · place ${n} armies`, `B the first line names their colour: "${u.line}"`, results);
}

// --- D · the threat line (a rigged save) and E · capitals ---------------------------------------------------
{
  const { page } = await fresh();
  // Slate (seat 1) holds 24 of 42 with a big stack: it needs 6 for 70 % and can plausibly take them next turn.
  const st = scenario({}, { kind: 'reinforce', remaining: 3, placed: {}, mustTrade: false } as never, {
    fill: (_t, i) => (i < 24 ? [1, i === 0 ? 40 : 2] : i < 34 ? [0, 1] : [2 + (i % 2), 1]),
    mutate: (x) => {
      x.phase = { kind: 'reinforce', remaining: 3, placed: {}, mustTrade: false } as never;
    },
  });
  await loadScenario(page, st);
  const chips = await page.evaluate(() =>
    [0, 1, 2, 3].map((i) => {
      const el = document.querySelector(`[data-testid="seat-${i}"] .sc-pers`);
      return { text: el?.textContent ?? '', threat: !!el?.classList.contains('is-threat'), shown: !!el && !el.classList.contains('hidden') };
    }),
  );
  check(chips[1].shown && chips[1].threat && /^needs 6\b/.test(chips[1].text), `D Slate's chip carries the threat: "${chips[1].text}" (is-threat ${chips[1].threat})`, results);
  check(!chips[2].threat && !chips[3].threat, `D no threat on seats that can't win next turn (${chips[2].text || '-'} / ${chips[3].text || '-'})`, results);
  await page.screenshot({ path: `${ART}/v6-threat.png` });

  // E · capitals off by default (New game → More), and on when switched on
  await clearStorage(page);
  await page.reload();
  await page.waitForFunction(() => window.__risk?.ui().screen === 'title');
  await clickBtn(page, 'title-new');
  await clickBtn(page, 'ng-more');
  const sw = page.locator('[data-testid="house-capitals"]');
  await sw.waitFor({ state: 'visible', timeout: 3000 });
  const off = { aria: await sw.getAttribute('aria-checked'), word: (await sw.locator('.switch-state').textContent())?.trim() };
  check(off.aria !== 'true' && off.word === 'Off', `E Capitals is off by default (${off.word}, aria-checked ${off.aria})`, results);
  check((await page.locator('[data-testid="draft"], [data-testid="house-draft"]').count()) === 0, 'E no Draft toggle', results);
  await sw.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="house-capitals"]')?.getAttribute('aria-checked') === 'true', null, { timeout: 2000 }).catch(() => undefined);
  const on = { aria: await sw.getAttribute('aria-checked'), word: (await sw.locator('.switch-state').textContent())?.trim() };
  check(on.aria === 'true' && on.word === 'On', `E the switch reads On once flipped (${on.word})`, results);
  await clickBtn(page, 'ng-start');
  const s = await humanTurn(page, 0);
  const caps = s.players.filter((p) => !p.neutral).map((p) => p.capital ?? null);
  check(!!s.config.capitals && caps.every((c) => !!c), `E capitals on: every seat has one (${caps.join(', ')})`, results);
  const marks = await page.evaluate((n) => Array.from({ length: n }, (_, i) => {
    const el = document.querySelector(`[data-testid="seat-capital-${i}"]`);
    return !!el && !el.classList.contains('hidden');
  }), s.players.length);
  check(marks.every(Boolean), `E each seat shows its capital mark (${marks.map((m) => (m ? 'yes' : 'no')).join(' ')})`, results);
  const holding = await page.evaluate(() => window.__risk.holding());
  check(!!holding && /capital \+1/.test(holding.breakdown ?? ''), `E the breakdown names it: "${holding?.breakdown}"`, results);
  await page.screenshot({ path: `${ART}/v6-capitals.png` });
}

// --- F · the victory sheet: Rematch on screen at two sizes, the replay skips on a key ------------------------
for (const vp of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  const { page } = await fresh(vp, '?replay');
  await page.evaluate(() => {
    sessionStorage.setItem('risk3d.e2e.realtime', '1');
    window.__risk.newGame({ players: [{ name: 'John', color: 'crimson', kind: 'human' }, { name: 'Slate', color: 'cobalt', kind: 'ai', difficulty: 'easy' }] as never, seed: 63 });
  });
  await humanTurn(page, 0);
  // the replay needs real speed (instant speed goes straight to the recap)
  await page.evaluate(() => (window.__risk as unknown as { __realSetSpeed?: (a: number, ai?: string) => void }).__realSetSpeed?.(1, 'watch'));
  await page.evaluate(() => window.__risk.setSpeed(1, 'watch'));
  await clickBtn(page, 'menu');
  await clickBtn(page, 'pause-endgame');
  await page.waitForSelector('[data-testid="confirm-yes"]', { state: 'visible', timeout: 3000 });
  await clickBtn(page, 'confirm-yes');
  await page.waitForFunction(() => window.__risk.ui().screen === 'victory', null, { timeout: 10_000 });
  const tag = `${vp.width}x${vp.height}`;
  const up = await page.waitForSelector('[data-testid="replay"]:not(.hidden)', { timeout: 5000 }).then(() => true, () => false);
  check(up, `F ${tag} the replay plays`, results);
  await page.waitForTimeout(400);
  await page.keyboard.press('x');
  const gone = await page.waitForFunction(() => {
    const r = document.querySelector('[data-testid="replay"]');
    return !r || r.classList.contains('hidden');
  }, null, { timeout: 1500 }).then(() => true, () => false);
  check(gone, `F ${tag} a key skips the replay`, results);
  await page.locator('[data-testid="rematch"]').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(800);
  const box = await page.locator('[data-testid="rematch"]').boundingBox();
  const inside = !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height;
  check(inside, `F ${tag} Rematch inside the viewport (${box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}` : 'none'})`, results);
  await page.screenshot({ path: `${ART}/v6-victory-${tag}.png` });
}

// --- G · a bad save doesn't brick Continue; keys are risk3d.v6.* ----------------------------------------------
{
  const { page } = await fresh();
  await page.evaluate(() => window.__risk.newGame({ players: [{ name: 'John', color: 'crimson', kind: 'human' }, { name: 'Slate', color: 'cobalt', kind: 'ai', difficulty: 'easy' }] as never, seed: 64 }));
  await humanTurn(page, 0);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('risk3d')));
  check(keys.includes('risk3d.v6.save') && keys.every((k) => k.startsWith('risk3d.v6.')), `G saves live under risk3d.v6.* (${keys.join(', ')})`, results);
  await page.evaluate(() => {
    const o = JSON.parse(localStorage.getItem('risk3d.v6.save')!);
    o.state.phase = { kind: 'draft-v6' };
    localStorage.setItem('risk3d.v6.save', JSON.stringify(o));
  });
  await page.reload();
  await page.waitForFunction(() => window.__risk?.ui().screen === 'title');
  await page.locator('[data-testid="title-continue"]').click();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({
    screen: window.__risk.ui().screen,
    note: document.querySelector('[data-testid="title-note"]')?.textContent ?? '',
    save: localStorage.getItem('risk3d.v6.save'),
    cont: !!(document.querySelector('[data-testid="title-continue"]') as HTMLElement | null)?.offsetParent,
  }));
  check(after.screen === 'title' && /couldn't be opened/.test(after.note), `G back on the title with one line: "${after.note}"`, results);
  check(!after.save && !after.cont, `G the bad save is dropped (Continue ${after.cont ? 'still shown' : 'gone'})`, results);
  await clickBtn(page, 'title-new');
  await clickBtn(page, 'ng-start');
  const ok = await page.waitForFunction(() => window.__risk.getState()?.phase.kind === 'reinforce', null, { timeout: 30_000 }).then(() => true, () => false);
  check(ok, 'G a new game starts after the bad save', results);
}

for (const c of ctxs) {
  allErrors.push(...c.errors);
  await c.browser.close().catch(() => undefined);
}
finish(results, allErrors);
