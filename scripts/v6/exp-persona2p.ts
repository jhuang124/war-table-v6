// v6: each personality against the classic Normal AI, 2 seats (first seat rotating), Evening 80%. Usage: [n]
import { classicTable, playRecorded, run, worker, pct, ci } from './lib';
import type { AiPersonality } from '../../src/engine';
worker((key, i) => {
  const c = classicTable(i, 2, { dominationPercent: 80, firstPlayer: i % 2 });
  c.players[1] = { ...c.players[1], personality: key as AiPersonality };
  return playRecorded(c).winner === 1 ? 1 : 0;
});
if (!process.env.SIM_KEY) {
  const N = Number(process.argv[2] ?? 1000);
  for (const p of ['turtle', 'opportunist', 'warlord']) {
    const rs = await run<number>(p, N);
    const w = rs.reduce((a, b) => a + b, 0);
    console.log(`| ${p} vs classic, 2p | ${pct(w, N)} (±${ci(w / N, N)}) | ${N} |`);
  }
}
