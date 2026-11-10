// v6 item 8: capitals, gated. Default table (seat 0 the human proxy moves first; AIs with personalities),
// Evening (2p 80%, 3–4p 70%). Variants: off · income +1/+2 · income +1/+2 and holding every capital wins.
// Gates vs off: median rounds ±1.5, first mover ±3 points, round-5 leader win rate up ≤ 5 points, ≤ 1/3 of games
// over before round 4. Usage: npx tsx scripts/v6/exp-capitals.ts [n] [variants]
import { defaultTable, playRecorded, run, worker, pct, median, mean } from './lib';
import type { GameConfig } from '../../src/engine';
type R = { r: number; first: boolean; l5: number; won5: boolean; byCap: boolean; capFalls: number };
function variant(v: string): Partial<GameConfig> {
  if (v === 'off') return {};
  const win = v.startsWith('win');
  return { capitals: { bonus: Number(v.slice(-1)), ...(win ? { holdAllWins: true } : {}) } };
}
worker((key, i) => {
  const [n, v] = key.split(':');
  const seats = Number(n);
  let capFalls = 0;
  const g = playRecorded(defaultTable(i, seats, { dominationPercent: seats === 2 ? 80 : 70, ...variant(v) }), {
    post: (_s, _a, ev) => { for (const e of ev) if (e.type === 'territoryConquered' && (e as { capitalOf?: number }).capitalOf !== undefined) capFalls++; },
  });
  const s5 = g.snaps.find((x) => x.round === 5);
  let l5 = -1;
  if (s5) { const t = s5.terr.map((x, k) => (s5.alive[k] ? x : -1)); l5 = t.indexOf(Math.max(...t)); }
  return { r: g.rounds, first: g.winner === g.firstPlayer, l5, won5: l5 >= 0 && g.winner === l5, byCap: g.by === 'capitals', capFalls } satisfies R;
});
if (!process.env.SIM_KEY) {
  const N = Number(process.argv[2] ?? 600);
  const vs = (process.argv[3] ?? 'off,inc1,inc2,win1,win2').split(',');
  console.log('| seats | capitals | median rounds (mean) | first mover wins | round-5 leader wins | over before round 4 | won by capitals | capitals taken/game | gates | n |\n|---|---|---|---|---|---|---|---|---|---|');
  for (const n of [2, 3, 4]) {
    let base: { med: number; first: number; l5: number } | null = null;
    for (const v of vs) {
      const rs = await run<R>(`${n}:${v}`, N);
      const med = median(rs.map((r) => r.r));
      const first = rs.filter((r) => r.first).length / N;
      const w5 = rs.filter((r) => r.l5 >= 0);
      const l5 = w5.filter((r) => r.won5).length / Math.max(1, w5.length);
      const early = rs.filter((r) => r.r < 4).length / N;
      if (v === 'off') base = { med, first, l5 };
      const gates = base && v !== 'off'
        ? [Math.abs(med - base.med) <= 1.5 ? 'len ok' : 'LEN', Math.abs(first - base.first) <= 0.03 ? 'first ok' : 'FIRST', l5 - base.l5 <= 0.05 ? 'snow ok' : 'SNOW', early <= 1 / 3 ? 'early ok' : 'EARLY'].join(' ')
        : '—';
      console.log(`| ${n} | ${v} | ${med} (${mean(rs.map((r) => r.r)).toFixed(2)}) | ${pct(first * N, N)} | ${pct(l5 * w5.length, w5.length)} | ${pct(early * N, N)} | ${pct(rs.filter((r) => r.byCap).length, N)} | ${mean(rs.map((r) => r.capFalls)).toFixed(1)} | ${gates} | ${N} |`);
    }
  }
}
