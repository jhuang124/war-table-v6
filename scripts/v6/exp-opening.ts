// v6 item 1: 2-player first-mover win rate with and without the quiet opening. Usage: npx tsx scripts/v6/exp-opening.ts [n]
import { classicTable, defaultTable, playRecorded, run, worker, pct, ci, median } from './lib';
import type { GameConfig } from '../../src/engine';

type R = { w: number; f: number; r: number };
function cfg(key: string, i: number): GameConfig {
  const [table, quiet, place, extra] = key.split(':');
  const over: Partial<GameConfig> = { dominationPercent: 80, quietOpening: quiet === 'on' };
  if (place === 'manual') over.initialPlacement = 'manual';
  if (extra === 'neutral') { over.neutral = true; over.dominationPercent = 70; }
  return table === 'classic' ? classicTable(i, 2, over) : defaultTable(i, 2, over);
}
worker((key, i) => {
  const g = playRecorded(cfg(key, i));
  return { w: g.winner, f: g.firstPlayer, r: g.rounds } satisfies R;
});
if (!process.env.SIM_KEY) {
  const N = Number(process.argv[2] ?? 1000);
  console.log(`| table | setup | quiet opening | first mover wins | median rounds | n |\n|---|---|---|---|---|---|`);
  for (const table of ['classic', 'default'])
    for (const place of ['auto', 'manual', 'auto-neutral'])
      for (const quiet of ['off', 'on']) {
        const [pl, ex] = place.split('-');
        const rs = await run<R>(`${table}:${quiet}:${pl}:${ex ?? ''}`, N);
        const w = rs.filter((g) => g.w === g.f).length;
        console.log(`| ${table} | ${place} | ${quiet} | ${pct(w, N)} (±${ci(w / N, N)}) | ${median(rs.map((g) => g.r))} | ${N} |`);
      }
}
