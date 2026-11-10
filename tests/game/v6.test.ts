// v6 integration (_claude/v6/INTEGRATION.md Part A1), controller side: the quiet opening explained, a person's first
// turn, the seat picker, the threat line, capitals, peace copy, cards, the ending, saves per release.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../../src/audio/types';
import type { BoardView, TerritoryPointerInfo } from '../../src/render/BoardView';
import { createController } from '../../src/game/controller';
import { memoryKV, SAVE_KEY, SETTINGS_KEY, UI_KEY, type KV } from '../../src/game/storage';
import type { GameState, TerritoryId } from '../../src/engine';
import { board as fixture, card } from './fixtures';
import { buildNewGameVM, defaultDraft, draftSummary, draftToConfig, removeSeat, sanitizeDraft } from '../../src/game/presets';

function fakeBoard() {
  const nop = () => undefined;
  const calls: [string, unknown][] = [];
  let click: ((i: TerritoryPointerInfo) => void) | null = null;
  const rec = (name: string) => (arg?: unknown) => void calls.push([name, arg]);
  const b = {
    syncState: rec('syncState'),
    playEvent: (ev: { type: string }) => {
      calls.push(['playEvent', ev.type]);
      return Promise.resolve();
    },
    setAnimationSpeed: nop,
    skipAnimations: nop,
    setHighlights: rec('setHighlights'),
    onTerritoryClick: (fn: (i: TerritoryPointerInfo) => void) => void (click = fn),
    onTerritoryHover: nop,
    focusTerritories: nop,
    resetCamera: nop,
    setAttractMode: nop,
    setShowLabels: nop,
    setViewportInsets: nop,
    setUiScale: nop,
    setCapitals: rec('setCapitals'),
    getScreenPosition: () => ({ x: 1, y: 1 }),
    getStats: () => ({ fps: 60, frameMsP95: 16, drawCalls: 0, triangles: 0, cameraMoving: false }),
    dispose: nop,
  } as unknown as BoardView;
  return {
    b,
    calls,
    last: (name: string) => [...calls].reverse().find((c) => c[0] === name)?.[1],
    click: (t: TerritoryId) => click?.({ territory: t, button: 0, clientX: 0, clientY: 0 } as unknown as TerritoryPointerInfo),
  };
}

function spyAudio() {
  const calls: string[] = [];
  const a = {
    unlock: () => undefined,
    play: (name: string) => void calls.push(`play:${name}`),
    setVolume: () => undefined,
    setMuted: () => undefined,
    setMusic: () => undefined,
    setMusicVolume: () => undefined,
    stopAll: () => undefined,
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

function make(kv: KV = memoryKV()) {
  const fb = fakeBoard();
  const au = spyAudio();
  const c = createController({ board: fb.b, audio: au.a, storage: kv, clock, dom: false, prefersReducedMotion: () => false });
  return { c, fb, au, kv };
}

async function load(s: GameState, kv: KV = memoryKV()) {
  kv.set(SAVE_KEY, JSON.stringify({ v: 1, savedAt: 0, state: s }));
  const r = make(kv);
  r.c.intent({ type: 'continue' });
  await vi.advanceTimersByTimeAsync(50);
  return r;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('9 · saves per release', () => {
  it('every key is namespaced risk3d.v6.*', () => {
    expect(SAVE_KEY).toBe('risk3d.v6.save');
    expect(UI_KEY).toBe('risk3d.v6.ui');
    expect(SETTINGS_KEY).toBe('risk3d.v6.settings');
  });

  it("a v5 save on the old key is not offered (and not overwritten)", () => {
    const kv = memoryKV();
    const v5 = JSON.stringify({ v: 1, savedAt: 0, state: fixture({ ural: [0, 3] }) });
    kv.set('risk3d.save.v1', v5);
    const { c } = make(kv);
    expect(c.getViewModel().save).toBeNull();
    expect(kv.get('risk3d.save.v1')).toBe(v5);
    c.dispose();
  });

  it("a save that can't be restored doesn't brick Continue: dropped, back to the title, one plain line", async () => {
    const bad = fixture({ ural: [0, 3] });
    (bad as unknown as { phase: { kind: string } }).phase = { kind: 'draft-v7' };
    const kv = memoryKV();
    kv.set(SAVE_KEY, JSON.stringify({ v: 1, savedAt: 0, state: bad }));
    const { c } = make(kv);
    expect(c.getViewModel().save).not.toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    c.intent({ type: 'continue' });
    await vi.advanceTimersByTimeAsync(50);
    warn.mockRestore();
    const vm = c.getViewModel();
    expect(vm.screen).toBe('title');
    expect(vm.game).toBeNull();
    expect(vm.save).toBeNull();
    expect(vm.notice).toBe("That saved game couldn't be opened, so it was cleared");
    expect(kv.get(SAVE_KEY)).toBeNull();
    // the line goes with the next step; New game still works
    c.intent({ type: 'nav', screen: 'newGame' });
    expect(c.getViewModel().notice ?? null).toBeNull();
    c.intent({ type: 'start' });
    await vi.advanceTimersByTimeAsync(50);
    expect(c.getViewModel().screen).toBe('game');
    c.dispose();
  });

  it('a territory map that is not the board (empty territories) is dropped the same way', async () => {
    const bad = fixture({ ural: [0, 3] });
    bad.territories = {} as GameState['territories'];
    const kv = memoryKV();
    kv.set(SAVE_KEY, JSON.stringify({ v: 1, savedAt: 0, state: bad }));
    const { c } = make(kv);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    c.intent({ type: 'continue' });
    await vi.advanceTimersByTimeAsync(50);
    warn.mockRestore();
    expect(c.getViewModel().screen).toBe('title');
    expect(c.getViewModel().notice).toMatch(/cleared/);
    c.dispose();
  });
});


describe('3 · the seat picker', () => {
  it('capitals are a house rule, off by default at every seat count, on only when switched on', () => {
    for (const n of [2, 3, 4]) {
      let d = defaultDraft();
      while (d.seats.length > n) d = removeSeat(d, d.seats.length - 1);
      expect(d.house.capitals).toBe(false);
      expect(draftToConfig(d, 1).capitals).toBeUndefined();
      expect(draftSummary(d)).not.toMatch(/capital/);
      const on = sanitizeDraft({ ...d, house: { ...d.house, capitals: true } });
      expect(on.house.capitals).toBe(true);
      expect(draftToConfig(on, 1).capitals).toEqual({ bonus: 1 });
      expect(draftSummary(on)).toMatch(/each capital pays \+1 a turn$/);
    }
    // a pre-v5.1 remembered draft never brings it in
    expect(sanitizeDraft({ house: { capitals: true } }).house.capitals).toBe(false);
  });

  it('difficulty says what it means; Full conquest is advanced; Quick is 60% or 8 rounds; no Draft', () => {
    const vm = buildNewGameVM(defaultDraft());
    expect(vm.difficultyOptions).toEqual([
      { id: 'easy', label: 'Easy', detail: 'plays loose' },
      { id: 'normal', label: 'Normal' },
      { id: 'hard', label: 'Hard', detail: '+1 army a turn' },
    ]);
    expect(vm.lengthOptions.find((o) => o.id === 'full')?.advanced).toBe(true);
    expect(vm.lengthOptions.filter((o) => o.advanced).map((o) => o.id)).toEqual(['full']);
    expect(vm.lengthOptions.find((o) => o.id === 'quick')?.detail).toBe('60% or 8 rounds');
    expect(draftToConfig(sanitizeDraft({ ...defaultDraft(), house: { ...defaultDraft().house, draft: true } }), 1).setupMode).toBe('random');
    // Hard is the hard AI +1 army a turn
    const d = defaultDraft();
    d.seats[1] = { ...d.seats[1], difficulty: 'hard' };
    expect(draftToConfig(d, 1).players[1]).toMatchObject({ difficulty: 'hard', handicap: 1 });
  });
});

/** Run fake time until the controller is idle on a live human turn (or `ms` passes). */
async function settle(c: ReturnType<typeof make>['c'], ms = 20_000) {
  for (let t = 0; t < ms; t += 50) {
    await vi.advanceTimersByTimeAsync(50);
    if (c.hooks.isIdle() && c.hooks.ui().trackLive) return;
  }
}

describe('1 · the quiet opening (2 players)', () => {
  const two = [
    { name: 'Vermilion', color: 'crimson' as const, kind: 'human' as const },
    { name: 'Slate', color: 'cobalt' as const, kind: 'human' as const },
  ];

  it('the line and the track explain it; Place → Fortify → End; the second player can attack', async () => {
    const { c, fb } = make();
    c.hooks.setSpeed(0, 'instant');
    c.hooks.newGame({ players: two, seed: 11 });
    await settle(c);
    let s = c.hooks.getState()!;
    expect(s.turn).toBe(1);
    expect(s.phase.kind).toBe('reinforce');
    const me = s.currentPlayer;
    const remaining = (s.phase as { remaining: number }).remaining;
    const colour = me === 0 ? 'Vermilion' : 'Slate';
    expect(c.hooks.ui().line).toBe(`You're ${colour} · place ${remaining} · no attacks this turn`);
    const seg = (id: string) => c.getViewModel().game!.strip.track.segments.find((x) => x.id === id)!;
    expect(seg('attack').state).toBe('locked');
    // Place everything on one territory.
    const own = (Object.keys(s.territories) as TerritoryId[]).find((t) => s.territories[t].owner === me)!;
    fb.click(own);
    await vi.advanceTimersByTimeAsync(100);
    c.intent({ type: 'button', id: 'place' });
    await vi.advanceTimersByTimeAsync(100);
    // never gold on Attack: the recommended step is past it
    let g = c.getViewModel().game!;
    expect(g.strip.track.recommended).not.toBe('attack');
    expect(g.gold).not.toEqual({ kind: 'segment', seg: 'attack' });
    if (c.hooks.getState()!.phase.kind === 'reinforce') expect(g.strip.line).toBe('No attacks on the opening turn · fortify or end your turn');
    // the auto-advance lands on Fortify, never Attack
    await vi.advanceTimersByTimeAsync(1500);
    s = c.hooks.getState()!;
    expect(s.phase.kind).toBe('fortify');
    g = c.getViewModel().game!;
    expect(g.strip.track.recommended).toBe('endTurn');
    c.intent({ type: 'track', seg: 'endTurn' });
    await vi.advanceTimersByTimeAsync(500);
    await settle(c);
    s = c.hooks.getState()!;
    expect(s.currentPlayer).not.toBe(me);
    expect(s.turn).toBe(2);
    // the second player: named, and Attack opens after placing
    const other = s.currentPlayer;
    expect(c.hooks.ui().line).toMatch(new RegExp(`^You're ${other === 0 ? 'Vermilion' : 'Slate'} · place \\d+ armies$`));
    const t2 = (Object.keys(s.territories) as TerritoryId[]).find((t) => s.territories[t].owner === other)!;
    fb.click(t2);
    await vi.advanceTimersByTimeAsync(100);
    c.intent({ type: 'button', id: 'place' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(c.hooks.getState()!.phase.kind).toBe('attack');
    expect(c.getViewModel().game!.strip.track.segments.find((x) => x.id === 'attack')!.state).toBe('current');
    c.dispose();
  });

  it('a click on the locked Attack segment puts the reason in the line', async () => {
    const { c } = make();
    c.hooks.setSpeed(0, 'instant');
    c.hooks.newGame({ players: two, seed: 5 });
    await settle(c);
    c.intent({ type: 'track', seg: 'attack' });
    await vi.advanceTimersByTimeAsync(20);
    expect(c.hooks.ui().line).toBe('No attacks on the opening turn');
    c.dispose();
  });
});

describe('2 · a person moves first', () => {
  it('1 human + 3 AI: the human moves first and the line names their colour', async () => {
    const { c } = make();
    c.hooks.setSpeed(0, 'instant');
    c.hooks.newGame({
      players: [
        { name: 'Vermilion', color: 'crimson', kind: 'human' },
        { name: 'Slate', color: 'cobalt', kind: 'ai', difficulty: 'normal' },
        { name: 'Ochre', color: 'amber', kind: 'ai', difficulty: 'normal' },
        { name: 'Sage', color: 'emerald', kind: 'ai', difficulty: 'normal' },
      ],
      seed: 3,
    });
    await settle(c);
    const s = c.hooks.getState()!;
    expect(s.turn).toBe(1);
    expect(s.currentPlayer).toBe(0);
    expect(c.hooks.ui().line).toMatch(/^You're Vermilion · place \d+ armies$/);
    c.dispose();
  });
});

describe('4 · the threat line and the seat card fields', () => {
  it('a seat that can win next turn: needs N · holds a set worth M; AI difficulty as a word', async () => {
    // John (0) holds 26 of 42 with a 30-army stack; the goal is 30 (70%).
    const own: Record<string, [number, number]> = {};
    const ids = Object.keys(fixture({}).territories) as TerritoryId[];
    ids.slice(0, 26).forEach((t) => (own[t] = [0, 2]));
    const s = fixture(own, { kind: 'attack' }, {});
    s.config = { ...s.config, dominationPercent: 70 };
    s.territories[ids[0]].armies = 30;
    s.players[0].cards = [card(1, 'infantry'), card(2, 'infantry'), card(3, 'infantry')];
    const { c } = await load(s);
    const seats = c.getViewModel().game!.seats;
    expect(seats[0].threat).toMatch(/^needs \d+ · holds a set worth \d+$/);
    expect(seats[2].difficulty).toBe('Normal');
    expect(seats[0].difficulty ?? null).toBeNull();
    expect(seats[1].threat ?? null).toBeNull();
    c.dispose();
  });
});

describe('5 · capitals', () => {
  it('the board marks them from the state; the breakdown says capital +1; the line names only its own seat losing it', async () => {
    const s = fixture({ ural: [0, 9], siberia: [1, 1], peru: [1, 3] }, { kind: 'attack' });
    s.config = { ...s.config, capitals: { bonus: 1 } };
    s.players[0].capital = 'ural';
    s.players[1].capital = 'siberia';
    s.players[2].capital = 'brazil';
    const { c, fb } = await load(s);
    expect(fb.last('setCapitals')).toEqual({ ural: 0, siberia: 1, brazil: 2 });
    // Sam's capital falls to John: named
    c.hooks.dispatch({ type: 'blitz', player: 0, from: 'ural', to: 'siberia' });
    for (let t = 0; t < 3000 && c.hooks.getState()!.territories.siberia.owner !== 0; t += 50) await vi.advanceTimersByTimeAsync(50);
    let said = '';
    for (let t = 0; t < 3000 && !said; t += 20) {
      await vi.advanceTimersByTimeAsync(20);
      const l = c.hooks.ui().line;
      if (/capital/.test(l)) said = l;
    }
    expect(said).toBe("Sam's capital falls · John takes Siberia");
    c.dispose();
  });

  it('capitalLine: own seat loses it or takes it back; a third holder changing hands is silent', async () => {
    const { capitalLine } = await import('../../src/game/controller');
    const s = fixture({});
    expect(capitalLine(s, 1, 0, 1, 'siberia')).toBe("Sam's capital falls · John takes Siberia");
    expect(capitalLine(s, 1, 1, 2, 'siberia')).toBe('Sam takes back its capital, Siberia');
    expect(capitalLine(s, 1, 0, 2, 'siberia')).toBeNull();
  });

  it('the holding breakdown names capitals', async () => {
    const { holdingBreakdown } = await import('../../src/game/story');
    expect(holdingBreakdown({ territoryCount: 9, base: 3, continents: [], total: 4, capitals: [{ territory: 'ural', of: 0, bonus: 1 }] })).toBe('9 territories +3 · capital +1');
  });
});

describe('6 · peace copy', () => {
  it('reads as one plain sentence', async () => {
    const { plainPeace } = await import('../../src/game/controller');
    expect(plainPeace('You asked Sage in round 5 · once a game')).toBe('You asked Sage in round 5 · you can ask each AI once a game');
    expect(plainPeace('You are at peace with Ochre · one peace at a time')).toBe('You are at peace with Ochre · you can hold one peace at a time');
    expect(plainPeace('Sage refuses · you are stronger')).toBe('Sage refuses · you are stronger');
  });
});

describe('7 · cards on every own step', () => {
  it('the hand is sent in Attack and Fortify too, with no trade there', async () => {
    const s = fixture({ ural: [0, 5], ukraine: [0, 3] }, { kind: 'attack' });
    s.players[0].cards = [card(1, 'infantry'), card(2, 'infantry'), card(3, 'infantry')];
    const { c } = await load(s);
    const cards = c.getViewModel().game!.cards!;
    expect(cards.hand).toHaveLength(3);
    expect(cards.trade).toBeNull();
    expect(cards.status).toBe('Set ready · trade it when you place');
    c.intent({ type: 'cardsPanel', open: true });
    expect(c.getViewModel().game!.cards!.open).toBe(true);
    c.dispose();
  });
});

describe('8 · the ending', () => {
  it('a real win: the victory screen rises when the board wave resolves, not at its start', async () => {
    let release: (() => void) | null = null;
    const s = fixture({ ural: [0, 30], siberia: [1, 1] }, { kind: 'attack' });
    for (const t of Object.keys(s.territories) as TerritoryId[]) if (t !== 'siberia') s.territories[t] = { owner: 0, armies: t === 'ural' ? 30 : 1 };
    s.players[2].eliminated = true;
    const kv = memoryKV();
    kv.set(SAVE_KEY, JSON.stringify({ v: 1, savedAt: 0, state: s }));
    const fb = fakeBoard();
    const orig = fb.b.playEvent;
    fb.b.playEvent = (ev, after, o) => (ev.type === 'gameOver' ? new Promise<void>((r) => (release = r)) : orig(ev, after, o));
    const au = spyAudio();
    const c = createController({ board: fb.b, audio: au.a, storage: kv, clock, dom: false, prefersReducedMotion: () => false });
    c.intent({ type: 'continue' });
    await vi.advanceTimersByTimeAsync(50);
    c.hooks.dispatch({ type: 'blitz', player: 0, from: 'ural', to: 'siberia' });
    for (let t = 0; t < 5000 && !release; t += 20) await vi.advanceTimersByTimeAsync(20);
    expect(release).not.toBeNull();
    expect(c.getViewModel().screen).toBe('game');
    expect(c.getViewModel().victory?.title).toBe('John holds the world');
    release!();
    await vi.advanceTimersByTimeAsync(50);
    expect(c.getViewModel().screen).toBe('victory');
    expect(c.getViewModel().victory!.subline).toMatch(/^Round 3 · 42 of 42 territories$/);
    expect(c.getViewModel().victory!.called ?? null).toBeNull();
    c.dispose();
  });
});
