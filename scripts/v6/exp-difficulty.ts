// v6 item 3: difficulty as armies. One test seat (rotating through the 4 seats) among three Normal AIs, Evening 70%,
// all AIs (no human), personalities drawn at random per seat. Usage: npx tsx scripts/v6/exp-difficulty.ts [n] [variants]
// variant = <difficulty>+<handicap>, e.g. hard+2.
import { classicTable, playRecorded, run, worker, pct, ci, median } from './lib';
import { hashInts } from '../../src/engine/rng';
import type { AiDifficulty, AiPersonality, GameConfig } from '../../src/engine';
type R = { w: number; r: number };
const PERS: AiPersonality[] = ['turtle', 'opportunist', 'warlord'];
export function table(i: number, n: number, seat: number, diff: AiDifficulty, handicap: number, personalities: boolean): GameConfig {
  const c = classicTable(i, n, { dominationPercent: n === 2 ? 80 : 70 });
  c.players = c.players.map((p, k) => ({
    ...p,
    ...(personalities ? { personality: PERS[hashInts(i, k, 77) % 3] } : {}),
    ...(k === seat ? { difficulty: diff, ...(handicap ? { handicap } : {}) } : {}),
  }));
  return c;
}
worker((key, i) => {
  const [v, pers] = key.split(':');
  const [diff, h] = v.split('+');
  const seat = i % 4;
  const g = playRecorded(table(i, 4, seat, diff as AiDifficulty, Number(h), pers === 'p'));
  return { w: g.winner === seat ? 1 : 0, r: g.rounds } satisfies R;
});
if (!process.env.SIM_KEY) {
  const N = Number(process.argv[2] ?? 1000);
  const vs = (process.argv[3] ?? 'normal+0,easy+0,hard+0,hard+1,hard+2,normal+1,normal+2').split(',');
  console.log('| test seat | AIs | test seat wins | median rounds | n |\n|---|---|---|---|---|');
  for (const pers of ['c', 'p'])
    for (const v of vs) {
      const rs = await run<R>(`${v}:${pers}`, N);
      const w = rs.filter((g) => g.w).length;
      console.log(`| ${v.replace('+', ' +')} | ${pers === 'p' ? 'personalities' : 'classic'} | ${pct(w, N)} (±${ci(w / N, N)}) | ${median(rs.map((g) => g.r))} | ${N} |`);
    }
}
