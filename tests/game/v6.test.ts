// v6 integration (_claude/v6/INTEGRATION.md Part A1), controller side: the quiet opening explained, a person's first
// turn, the seat picker, the threat line, capitals, peace copy, cards, the ending, saves per release.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../../src/audio/types';
import type { BoardView, TerritoryPointerInfo } from '../../src/render/BoardView';
import { createController } from '../../src/game/controller';
import { memoryKV, SAVE_KEY, SETTINGS_KEY, UI_KEY, type KV } from '../../src/game/storage';
import type { GameState, TerritoryId } from '../../src/engine';
import { board as fixture } from './fixtures';

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

