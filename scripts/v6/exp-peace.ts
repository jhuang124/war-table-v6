// v6 item 7: does always asking for peace still stretch the game? Seat 0 (human proxy) asks the AI with the most
// armies on its border whenever allowed (audit exp10's policy). Default table, Evening 70%.
// Usage: npx tsx scripts/v6/exp-peace.ts [n]
import { canAskPeace, mapDefOf, type GameState } from '../../src/engine';
import { defaultTable, playRecorded, run, worker, pct, ci, median, mean } from './lib';
function borderStack(s: GameState, ai: number): number {
  const m = mapDefOf(s.config);
  let a = 0;
  for (const t of m.territoryIds) if (s.territories[t].owner === ai && m.adjacency[t].some((n) => s.territories[n].owner === 0)) a += s.territories[t].armies;
  return a;
}
type R = { w0: boolean; r: number; asks: number; yes: number };
worker((key, i) => {
  const [n, mode] = key.split(':');
  let asks = 0, yes = 0;
  const g = playRecorded(defaultTable(i, Number(n), { dominationPercent: 70 }), mode === 'ask' ? {
    override: (s) => {
      if (s.currentPlayer !== 0 || s.phase.kind !== 'reinforce' || s.phase.midTurn) return null;
      let best = -1, bs = 0;
      for (const p of s.players) if (p.id !== 0 && canAskPeace(s, 0, p.id)) { const b = borderStack(s, p.id); if (b > bs) { bs = b; best = p.id; } }
      return best < 0 ? null : { type: 'askPeace', player: 0, to: best };
    },
    post: (_s, a, ev) => { if (a.type === 'askPeace') { asks++; if (ev.some((e) => e.type === 'peaceAnswered' && (e as { accepted?: boolean }).accepted)) yes++; } },
  } : {});
  return { w0: g.winner === 0, r: g.rounds, asks, yes } satisfies R;
});
if (!process.env.SIM_KEY) {
  const N = Number(process.argv[2] ?? 1000);
  console.log('| seats | seat 0 | seat 0 wins | asks/game | accepted | median rounds (mean) | n |\n|---|---|---|---|---|---|---|');
  for (const n of [3, 4])
    for (const mode of ['never', 'ask']) {
      const rs = await run<R>(`${n}:${mode}`, N);
      const w = rs.filter((r) => r.w0).length, a = rs.reduce((x, r) => x + r.asks, 0), y = rs.reduce((x, r) => x + r.yes, 0);
      console.log(`| ${n} | ${mode === 'ask' ? 'always asks' : 'never asks'} | ${pct(w, N)} (±${ci(w / N, N)}) | ${(a / N).toFixed(1)} | ${pct(y, a)} | ${median(rs.map((r) => r.r))} (${mean(rs.map((r) => r.r)).toFixed(2)}) | ${N} |`);
    }
}
