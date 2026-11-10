// v6 item 5: does the threat flag see the end coming, and do the AIs break it? Default table (seat 0 the human
// proxy, AIs with personalities), Evening 70% (2p 80%). The flag is read as each seat's turn ends; "next-turn win"
// = that seat wins on its very next turn. Usage: npx tsx scripts/v6/exp-threat.ts [n] [stop|nostop]
import { defaultTable, playRecorded, run, worker, pct, median, mean } from './lib';
import { PERSONAS, threatFor, type GameState } from '../../src/engine';
import { THREAT_MODEL } from '../../src/engine/threat';
type R = { flags: number; flagWins: number; winnerFlagged: boolean; anyFlag: boolean; rounds: number; firstFlagRound: number };
worker((key, i) => {
  const [n, mode, loss, share] = key.split(':');
  if (loss) THREAT_MODEL.loss = Number(loss);
  if (share) THREAT_MODEL.spareShare = Number(share);
  if (mode === 'nostop') for (const d of ['easy', 'normal', 'hard'] as const) PERSONAS[d].stopWeight = 0;
  if (mode.startsWith('stop') && mode.length > 4) { PERSONAS.normal.stopWeight = Number(mode.slice(4)); PERSONAS.hard.stopWeight = Number(mode.slice(4)) + 1; }
  const seats = Number(n);
  let flagged: Record<number, boolean> = {};
  let flags = 0, flagWins = 0, firstFlagRound = 0;
  let last: GameState | null = null;
  let lastPlayer = -1;
  const g = playRecorded(defaultTable(i, seats, { dominationPercent: seats === 2 ? 80 : 70 }), {
    post: (s, _a, ev) => {
      for (const e of ev) {
        if (e.type === 'turnStarted') {
          // The seat whose turn just ended: read its flag on the board it left.
          if (lastPlayer >= 0 && last) {
            const f = threatFor(s, lastPlayer).canWinNext;
            flagged[lastPlayer] = f;
            if (f) { flags++; if (!firstFlagRound) firstFlagRound = s.round; }
          }
          lastPlayer = (e as unknown as { player: number }).player;
        }
      }
      last = s;
    },
  });
  // Did the winner win on the turn right after being flagged?
  const winnerFlagged = g.winner >= 0 && !!flagged[g.winner];
  if (winnerFlagged) flagWins++;
  return { flags, flagWins, winnerFlagged, anyFlag: flags > 0, rounds: g.rounds, firstFlagRound } satisfies R;
});
if (!process.env.SIM_KEY) {
  const N = Number(process.argv[2] ?? 500);
  console.log('| seats | AI breaks a next-turn win | games with a flag | flags/game | games won on the turn after a flag | precision (wins ÷ flags) | median rounds | median first flag round | n |\n|---|---|---|---|---|---|---|---|---|');
  for (const n of [2, 3, 4])
    for (const mode of (process.argv[3] ?? 'nostop,stop').split(',')) {
      const rs = await run<R>(`${n}:${mode}:${process.argv[4] ?? ''}:${process.argv[5] ?? ''}`, N);
      const fl = rs.reduce((a, r) => a + r.flags, 0);
      const fw = rs.filter((r) => r.winnerFlagged).length;
      console.log(`| ${n} | ${mode === 'nostop' ? 'off' : mode} | ${pct(rs.filter((r) => r.anyFlag).length, N)} | ${(fl / N).toFixed(2)} | ${pct(fw, N)} | ${pct(fw, fl)} | ${median(rs.map((r) => r.rounds))} (mean ${mean(rs.map((r) => r.rounds)).toFixed(2)}) | ${median(rs.filter((r) => r.anyFlag).map((r) => r.firstFlagRound))} | ${N} |`);
    }
}
