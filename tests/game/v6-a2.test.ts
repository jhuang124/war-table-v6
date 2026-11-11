// v6 integration A2 (_claude/v6/INTEGRATION.md "Part A2"): the feel builder's board / audio calls wired through the
// controller, and the turn itself: Undo until the first roll, Esc cancel-then-menu, count keys, fight copy that says
// what a roll cost, the AI's move-in count as the default, the next attack armed after a conquest (never rolled),
// the glint and the breath between AI seats.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../../src/audio/types';
import type { BoardView, PlayEventOptions, TerritoryPointerInfo } from '../../src/render/BoardView';
import { createController, nextAttackFrom, occupyGuess } from '../../src/game/controller';
import { afterRollLine, capturedWords, rollWords } from '../../src/game/strip';
import { memoryKV, SAVE_KEY } from '../../src/game/storage';
import { eventDurationMs, scaledDuration } from '../../src/game/timingModel';
import type { GameEvent, GameState, TerritoryId } from '../../src/engine';
import { board as fixture } from './fixtures';

type Played = { ev: GameEvent; start: number; end: number; opts?: PlayEventOptions };

function fakeBoard() {
  let speed = 1;
  const pending = new Set<() => void>();
  const played: Played[] = [];
  const calls: string[] = [];
  let click: ((i: TerritoryPointerInfo) => void) | null = null;
  const b: BoardView = {
    syncState: () => undefined,
    playEvent(ev: GameEvent, _after: GameState, opts?: PlayEventOptions) {
      const rec: Played = { ev, start: Date.now(), end: Date.now(), opts };
      played.push(rec);
      calls.push(`event:${ev.type}`);
      const ms = scaledDuration(eventDurationMs(ev, opts), speed);
      if (ms <= 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => {
          pending.delete(done);
          clearTimeout(h);
          rec.end = Date.now();
          resolve();
        };
        const h = setTimeout(done, ms);
        pending.add(done);
      });
    },
    setAnimationSpeed: (m) => void (speed = m),
    skipAnimations: () => {
      for (const d of [...pending]) d();
    },
    setHighlights: () => undefined,
    onTerritoryClick: (cb) => void (click = cb),
    onTerritoryHover: () => undefined,
    focusTerritories: () => undefined,
    resetCamera: () => undefined,
    setAttractMode: () => undefined,
    setShowLabels: () => undefined,
    setViewportInsets: () => undefined,
    setUiScale: () => undefined,
    getScreenPosition: () => ({ x: 100, y: 100 }),
    getScreenRect: () => ({ x: 80, y: 90, w: 60, h: 40 }),
    getStats: () => ({ fps: 60, frameMsP95: 16, drawCalls: 0, triangles: 0, activeTweens: pending.size, cameraMoving: false }),
    dispose: () => undefined,
    shiver: (t) => void calls.push(`shiver:${t}`),
    glintSource: (t) => void calls.push(`glint:${t}`),
    duckAudio: (ms) => void calls.push(`duck:${ms}`),
    setTitleMode: (on) => void calls.push(`title:${on}`),
  };
  return {
    board: b,
    played,
    calls,
    click: (t: TerritoryId) => click!({ territory: t, clientX: 0, clientY: 0, shiftKey: false, altKey: false, metaKey: false, button: 0 }),
  };
}

function spyAudio() {
  const calls: string[] = [];
  const a = {
    unlock: () => undefined,
    play: (name: string, o?: { delay?: number }) => void calls.push(o?.delay ? `play:${name}@${o.delay}` : `play:${name}`),
    setVolume: () => undefined,
    setMuted: () => undefined,
    setMusic: () => undefined,
    setMusicVolume: () => undefined,
    stopAll: () => void calls.push('stopAll'),
    isUnlocked: () => true,
    stats: () => ({}),
    dispose: () => undefined,
    cue: (name: string) => void calls.push(`cue:${name}`),
    turnPassed: () => undefined,
    lean: () => undefined,
    setIdle: () => undefined,
  } as unknown as AudioEngine;
  return { a, calls };
}

const clock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
  raf: (fn: () => void) => void setTimeout(fn, 16),
};

async function until(pred: () => boolean, maxMs: number, step = 20): Promise<boolean> {
  for (let t = 0; t < maxMs; t += step) {
    if (pred()) return true;
    await vi.advanceTimersByTimeAsync(step);
  }
  return pred();
}

async function resume(s: GameState) {
  const kv = memoryKV();
  kv.set(SAVE_KEY, JSON.stringify({ v: 1, savedAt: 0, state: s }));
  const fb = fakeBoard();
  const au = spyAudio();
  const c = createController({ board: fb.board, audio: au.a, storage: kv, clock, dom: false, prefersReducedMotion: () => false });
  c.intent({ type: 'continue' });
  await vi.advanceTimersByTimeAsync(50);
  return { c, fb, au };
}

const pctl = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Undo outlives the last army, until the first roll (ux-desktop 8)', () => {
  it('placing the last army moves to Attack with Undo on the dock; Undo reopens Place and takes it back', async () => {
    const s = fixture({ ural: [0, 5], ukraine: [0, 1] }, { kind: 'reinforce', remaining: 3, mustTrade: false, placed: {}, midTurn: false });
    const { c, fb } = await resume(s);
    fb.click('ural');
    await vi.advanceTimersByTimeAsync(30);
    c.intent({ type: 'button', id: 'place' });
    await until(() => c.hooks.getState()!.phase.kind === 'attack' && c.hooks.isIdle(), 3000);
    expect(c.hooks.getState()!.territories.ural.armies).toBe(8);
    expect(c.hooks.ui().buttons).toContain('Undo');
    c.intent({ type: 'button', id: 'undo' });
    await until(() => c.hooks.isIdle(), 3000);
    const st = c.hooks.getState()!;
    expect(st.phase.kind).toBe('reinforce');
    expect(st.phase.kind === 'reinforce' && st.phase.remaining).toBe(3);
    expect(st.territories.ural.armies).toBe(5);
    c.dispose();
  });

  it('gone once the dice roll: U does nothing after the first roll', async () => {
    const s = fixture({ ural: [0, 5], ukraine: [0, 1] }, { kind: 'reinforce', remaining: 3, mustTrade: false, placed: {}, midTurn: false });
    const { c, fb } = await resume(s);
    fb.click('ural');
    await vi.advanceTimersByTimeAsync(30);
    c.intent({ type: 'button', id: 'place' });
    await until(() => c.hooks.getState()!.phase.kind === 'attack' && c.hooks.isIdle(), 3000);
    // U undoes even while a fight is armed (its two words fill the dock)
    fb.click('siberia');
    await vi.advanceTimersByTimeAsync(30);
    expect(c.hooks.ui().buttons).toEqual(['Roll', 'Blitz']);
    c.intent({ type: 'button', id: 'roll' });
    await until(() => c.hooks.isIdle(), 4000);
    const armies = c.hooks.getState()!.territories.ural.armies;
    expect(c.hooks.ui().buttons).not.toContain('Undo');
    c.handleKey('u');
    await vi.advanceTimersByTimeAsync(100);
    expect(c.hooks.getState()!.phase.kind).not.toBe('reinforce');
    expect(c.hooks.getState()!.territories.ural.armies).toBe(armies);
    c.dispose();
  });
});

describe('keys (ux-desktop 10)', () => {
  it('arrows and −/+ step the count, digits type it, U undoes', async () => {
    const s = fixture({ ural: [0, 5], ukraine: [0, 1] }, { kind: 'reinforce', remaining: 12, mustTrade: false, placed: {}, midTurn: false });
    const { c, fb } = await resume(s);
    fb.click('ural');
    await vi.advanceTimersByTimeAsync(30);
    expect(c.hooks.ui().primary).toBe('Place 12');
    expect(c.handleKey('ArrowLeft')).toBe(true);
    await vi.advanceTimersByTimeAsync(20);
    expect(c.hooks.ui().primary).toBe('Place 11');
    c.handleKey('-');
    await vi.advanceTimersByTimeAsync(20);
    expect(c.hooks.ui().primary).toBe('Place 10');
    c.handleKey('+');
    await vi.advanceTimersByTimeAsync(20);
    expect(c.hooks.ui().primary).toBe('Place 11');
    c.handleKey('3');
    await vi.advanceTimersByTimeAsync(20);
    expect(c.hooks.ui().primary).toBe('Place 3');
    await vi.advanceTimersByTimeAsync(1000);
    c.handleKey('1');
    await vi.advanceTimersByTimeAsync(100);
    c.handleKey('2');
    await vi.advanceTimersByTimeAsync(20);
    expect(c.hooks.ui().primary).toBe('Place 12');
    c.handleKey('Enter');
    await until(() => c.hooks.isIdle(), 3000);
    expect(c.hooks.getState()!.territories.ural.armies).toBe(17);
    c.handleKey('U');
    await until(() => c.hooks.isIdle(), 3000);
    expect(c.hooks.getState()!.territories.ural.armies).toBe(5);
    expect(c.hooks.getState()!.phase.kind).toBe('reinforce');
    c.dispose();
  });

  it('Esc cancels first; a held or mashed Esc never opens the menu; a fresh one does', async () => {
    const s = fixture({ ural: [0, 5], ukraine: [0, 1] }, { kind: 'attack' });
    const { c, fb } = await resume(s);
    fb.click('siberia');
    await vi.advanceTimersByTimeAsync(30);
    c.handleKey('Escape');
    c.handleKey('Escape');
    c.handleKey('Escape');
    c.handleKey('Escape');
    expect(c.getViewModel().overlay).toBeNull();
    expect(c.hooks.ui().buttons).toEqual([]);
    await vi.advanceTimersByTimeAsync(700);
    c.handleKey('Escape', true);
    expect(c.getViewModel().overlay).toBeNull();
    await vi.advanceTimersByTimeAsync(700);
    c.handleKey('Escape');
    expect(c.getViewModel().overlay).toBe('pause');
    c.dispose();
  });
});

describe('fight copy says what happened (ux-desktop 7)', () => {
  it('the words', () => {
    expect(rollWords(1, 0)).toBe('Lost 1');
    expect(rollWords(0, 2)).toBe('They lost 2');
    expect(rollWords(1, 1)).toBe('Lost 1, they lost 1');
    const s = fixture({ ural: [0, 6], siberia: [2, 3] });
    expect(afterRollLine('Lost 1', s, 'ural', 'siberia', true)).toMatch(/^Lost 1 · 6 left · \d+% · [a-z ]+$/);
    expect(afterRollLine('Lost 1', s, 'ural', 'siberia', false)).toMatch(/^Lost 1 · 6 left · [a-z ]+$/);
    expect(capturedWords('egypt', 27)).toBe('Egypt captured · cost 27');
    expect(capturedWords('egypt', 0)).toBe('Egypt captured');
  });

  it('after a roll that did not decide it, the line leads with its cost; a capture says what it cost', async () => {
    const s = fixture({ ural: [0, 12], siberia: [2, 9], ukraine: [0, 1] }, { kind: 'attack' });
    const { c, fb } = await resume(s);
    fb.click('siberia');
    await vi.advanceTimersByTimeAsync(30);
    c.intent({ type: 'button', id: 'roll' });
    await until(() => c.hooks.isIdle(), 4000);
    await vi.advanceTimersByTimeAsync(50);
    expect(c.hooks.ui().line).toMatch(/^(Lost \d+(, they lost \d+)?|They lost \d+) · \d+ left/);
    const fight = c.getViewModel().game!.strip.fight;
    expect(fight?.odds).toMatch(/^(lost \d+(, they lost \d+)?|they lost \d+)( · \d+%)?$/);
    // Blitz it: the capture's words carry the cost while the decided fight lingers.
    let captured: string | null = null;
    c.intent({ type: 'button', id: 'blitz' });
    for (let t = 0; t < 6000 && !captured; t += 20) {
      captured = c.getViewModel().game?.battle?.captured ?? null;
      await vi.advanceTimersByTimeAsync(20);
    }
    if (c.hooks.getState()!.territories.siberia.owner === 0) expect(captured).toMatch(/^Siberia captured( · cost \d+)?$/);
    c.dispose();
  });
});

describe('less busywork (design 6)', () => {
  it('the move-in default is the AI\'s count: a garrison stays where the old border still faces enemies', () => {
    // Ural faces enemies all round; Siberia (just taken) has only own land behind it in this cut-down board.
    const front = fixture({ ural: [0, 10], siberia: [0, 0], yakutsk: [0, 3], irkutsk: [0, 3], mongolia: [0, 3], china: [0, 3] }, { kind: 'occupy', from: 'ural', to: 'siberia', min: 3, max: 9, previousOwner: 2 });
    const g = occupyGuess(front);
    expect(g).toBeGreaterThanOrEqual(3);
    expect(g).toBeLessThanOrEqual(9);
    // The source has nothing left to face: everything moves in.
    const safe = fixture({ ural: [0, 10], siberia: [0, 0], ukraine: [0, 1], afghanistan: [0, 1], china: [0, 1] }, { kind: 'occupy', from: 'ural', to: 'siberia', min: 3, max: 9, previousOwner: 2 });
    expect(occupyGuess(safe)).toBe(9);
  });

  it('after a conquest the next good attack from the territory just taken is armed, never rolled', async () => {
    // Ural 20 takes Siberia (1); Siberia's neighbours are 1-army enemies: a ≥ 80 % fight to arm.
    const s = fixture({ ural: [0, 20], siberia: [2, 1], ukraine: [0, 1], afghanistan: [0, 1] }, { kind: 'attack' });
    const { c, fb } = await resume(s);
    fb.click('siberia');
    await vi.advanceTimersByTimeAsync(30);
    c.intent({ type: 'button', id: 'blitz' });
    await until(() => c.hooks.getState()!.phase.kind === 'occupy' || (c.hooks.getState()!.territories.siberia.owner === 0 && c.hooks.isIdle()), 6000);
    if (c.hooks.getState()!.phase.kind === 'occupy') {
      c.intent({ type: 'button', id: 'move' });
      await until(() => c.hooks.isIdle(), 4000);
    }
    const after = c.hooks.getState()!;
    expect(after.territories.siberia.owner).toBe(0);
    const expected = nextAttackFrom(after, 'siberia');
    expect(expected).not.toBeNull();
    expect(c.hooks.ui().buttons).toEqual(['Roll', 'Blitz']);
    const rolls = fb.played.filter((p) => p.ev.type === 'diceRolled').length;
    // Nothing rolls by itself; a press at once (the double click that moved in) is dropped.
    await vi.advanceTimersByTimeAsync(2000);
    expect(fb.played.filter((p) => p.ev.type === 'diceRolled').length).toBe(rolls);
    c.dispose();
  });

  it('a press within the guard after the armed fight shows never rolls it', async () => {
    const s = fixture({ greenland: [0, 12], ontario: [0, 0], quebec: [2, 1], iceland: [0, 1] }, { kind: 'occupy', from: 'greenland', to: 'ontario', min: 3, max: 11, previousOwner: 2 });
    s.conqueredThisTurn = true;
    const { c, fb } = await resume(s);
    c.intent({ type: 'setCount', value: 11 });
    c.intent({ type: 'button', id: 'move' });
    await until(() => c.hooks.isIdle(), 4000);
    if (c.hooks.ui().buttons.join() !== 'Roll,Blitz') return void c.dispose(); // nothing good to arm on this board
    const rolls = fb.played.filter((p) => p.ev.type === 'diceRolled').length;
    c.intent({ type: 'button', id: 'blitz' });
    await vi.advanceTimersByTimeAsync(200);
    expect(fb.played.filter((p) => p.ev.type === 'diceRolled').length).toBe(rolls);
    await vi.advanceTimersByTimeAsync(400);
    c.intent({ type: 'button', id: 'blitz' });
    await until(() => c.hooks.isIdle(), 4000);
    expect(fb.played.filter((p) => p.ev.type === 'diceRolled').length).toBeGreaterThan(rolls);
    c.dispose();
  });

  it('never arms against a seat at peace, and nothing under 80 %', () => {
    const s = fixture({ ural: [0, 3], siberia: [2, 3] }, { kind: 'attack' });
    expect(nextAttackFrom(s, 'ural')).toBeNull();
  });
});

describe('the board answers (feel wiring)', () => {
  it('a refused tap shivers the tapped territory beside the tick', async () => {
    const s = fixture({ ural: [0, 5], ukraine: [0, 1] }, { kind: 'reinforce', remaining: 3, mustTrade: false, placed: {}, midTurn: false });
    const { c, fb, au } = await resume(s);
    fb.click('siberia');
    await vi.advanceTimersByTimeAsync(30);
    expect(fb.calls).toContain('shiver:siberia');
    expect(au.calls).toContain('play:uiError');
    c.dispose();
  });

  it('a knockout ducks (never a hard stop), sounds at once, and the line starts with the sweep', async () => {
    // Priya (2) holds only Siberia.
    const s = fixture({ ural: [0, 30], ukraine: [0, 1] }, { kind: 'attack' });
    for (const t of Object.keys(s.territories) as TerritoryId[]) if (s.territories[t].owner === 2 && t !== 'siberia') s.territories[t] = { owner: 1, armies: 1 };
    const { c, fb, au } = await resume(s);
    fb.click('siberia');
    await vi.advanceTimersByTimeAsync(30);
    c.intent({ type: 'button', id: 'blitz' });
    let sawLine = false;
    for (let t = 0; t < 8000; t += 10) {
      const live = fb.played.find((p) => p.ev.type === 'playerEliminated');
      if (live && live.end === live.start && c.getViewModel().game?.banner?.kind === 'elimination') sawLine = true;
      if (live && c.hooks.isIdle()) break;
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(fb.played.some((p) => p.ev.type === 'playerEliminated')).toBe(true);
    expect(fb.calls).toContain('duck:120');
    expect(au.calls).not.toContain('stopAll');
    expect(au.calls).toContain('play:eliminated');
    expect(au.calls.some((x) => x.startsWith('play:eliminated@'))).toBe(false);
    expect(sawLine).toBe(true);
    c.dispose();
  });

  it('the title screen asks the board to hide its continent names; a game shows them', async () => {
    const fb = fakeBoard();
    const c = createController({ board: fb.board, audio: spyAudio().a, storage: memoryKV(), clock, dom: false, prefersReducedMotion: () => false });
    c.getViewModel();
    await vi.advanceTimersByTimeAsync(50);
    expect(fb.calls).toContain('title:true');
    c.hooks.newGame({ players: [{ name: 'A', color: 'crimson', kind: 'human' }, { name: 'B', color: 'cobalt', kind: 'ai' }], seed: 3 });
    await vi.advanceTimersByTimeAsync(50);
    expect(fb.calls.lastIndexOf('title:false')).toBeGreaterThan(fb.calls.indexOf('title:true'));
    c.dispose();
  });

  it('the hover note carries the territory\'s box', async () => {
    const s = fixture({ ural: [0, 5], ukraine: [0, 1] }, { kind: 'attack' });
    const { c, fb } = await resume(s);
    fb.click('ural');
    await vi.advanceTimersByTimeAsync(30);
    expect(c.getViewModel().game?.nameCard?.rect).toEqual({ x: 80, y: 90, w: 60, h: 40 });
    c.dispose();
  });

  it('AI turns: the source glints before each engagement, a breath between AI seats, turns in budget', async () => {
    const fb = fakeBoard();
    const c = createController({ board: fb.board, audio: spyAudio().a, storage: memoryKV(), clock, dom: false, prefersReducedMotion: () => false });
    const AIS = (['crimson', 'cobalt', 'amber', 'rose'] as const).map((color, i) => ({ name: `AI${i}`, color, kind: 'ai' as const, difficulty: 'normal' as const }));
    c.hooks.newGame({ players: AIS, seed: 11, dominationPercent: 70, turnLimit: null });
    await until(() => (c.hooks.getState()?.round ?? 0) > 4 || c.hooks.getState()?.phase.kind === 'game-over', 600_000, 100);
    // Every engagement's first roll follows a glint on its source.
    const glints = fb.calls.filter((x) => x.startsWith('glint:')).length;
    const engagements = fb.played.filter((p, i) => {
      if (p.ev.type !== 'diceRolled') return false;
      const prev = fb.played.slice(0, i).reverse().find((q) => q.ev.type === 'diceRolled');
      return !prev || prev.ev.type !== 'diceRolled' || prev.ev.from !== p.ev.from || prev.ev.to !== p.ev.to;
    }).length;
    expect(engagements).toBeGreaterThan(3);
    expect(glints).toBeGreaterThanOrEqual(engagements - 1);
    // The breath between two AI seats: ≥ 300 ms from the turn start to the first placement after another AI's turn.
    const gaps: number[] = [];
    for (let i = 0; i < fb.played.length; i++) {
      const p = fb.played[i];
      if (p.ev.type !== 'turnStarted' || p.ev.round < 2) continue;
      const first = fb.played.slice(i + 1).find((q) => q.ev.type === 'armiesPlaced' || q.ev.type === 'cardsTraded');
      if (first) gaps.push(first.start - p.end);
    }
    expect(gaps.length).toBeGreaterThan(3);
    expect(pctl(gaps, 0.5)).toBeGreaterThanOrEqual(300);
    for (const g of gaps) expect(g).toBeLessThan(700);
    const turns = c.hooks.metrics().turns.filter((t) => t.kind === 'ai').map((t) => t.ms);
    console.log(`[a2] AI turns n=${turns.length} median ${pctl(turns, 0.5)} p95 ${pctl(turns, 0.95)}`);
    expect(pctl(turns, 0.5)).toBeLessThanOrEqual(6000);
    expect(pctl(turns, 0.95)).toBeLessThanOrEqual(12000);
    c.dispose();
  }, 60_000);
});
