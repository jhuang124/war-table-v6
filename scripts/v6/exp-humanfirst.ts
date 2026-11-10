// v6 item 2: a human moves first. Seat 0 (the human proxy: classic normal AI flagged human) on the default table,
// Evening 70%; "rotating" pins the first seat to i % n (the old random draw's spread). Usage: npx tsx scripts/v6/exp-humanfirst.ts [n]
import { defaultTable, playRecorded, run, worker, pct, ci, median } from './lib';
type R = { w: number; f: number; r: number };
worker((key, i) => {
  const [n, mode] = key.split(':');
  const seats = Number(n);
  const g = playRecorded(defaultTable(i, seats, { dominationPercent: seats === 2 ? 80 : 70, ...(mode === 'rot' ? { firstPlayer: i % seats } : {}), ...(mode === 'quiet' ? { quietOpening: true } : {}) }));
  return { w: g.winner, f: g.firstPlayer, r: g.rounds } satisfies R;
});
if (!process.env.SIM_KEY) {
  const N = Number(process.argv[2] ?? 1000);
  console.log('| seats | first seat | human wins | first mover wins | median rounds | n |\n|---|---|---|---|---|---|');
  for (const n of (process.argv[4] ?? '3,4').split(',').map(Number))
    for (const mode of (process.argv[3] ?? 'rot,human').split(',')) {
      const rs = await run<R>(`${n}:${mode}`, N);
      const h = rs.filter((g) => g.w === 0).length;
      const f = rs.filter((g) => g.w === g.f).length;
      console.log(`| ${n} | ${mode === 'rot' ? 'rotating' : mode === 'quiet' ? 'human first + quiet opening' : 'human first'} | ${pct(h, N)} (±${ci(h / N, N)}) | ${pct(f, N)} | ${median(rs.map((g) => g.r))} | ${N} |`);
    }
}
