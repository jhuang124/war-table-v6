// v6 item 4: can you tell the personalities apart? Mixed 4-seat all-AI tables (the three personalities shuffled
// plus one more at random), Normal, Evening 70%. Per personality: fights per turn (all game / rounds 1–2),
// mean blitz odds, share of near-even fights (odds < 0.65), share of attacks on the territory leader and on the
// weakest seat, biggest stack as a share of its armies at its turn end, win rate per seat-game.
// Usage: npx tsx scripts/v6/exp-persona.ts [n] [difficulty]
import { classicTable, playRecorded, run, worker, pct } from './lib';
import { hashInts } from '../../src/engine/rng';
import { mapDefOf, winProbability, type AiPersonality, type GameState } from '../../src/engine';
const PERS: AiPersonality[] = ['turtle', 'opportunist', 'warlord'];
type Acc = { turns: number; turnsEarly: number; fights: number; fightsEarly: number; odds: number; even: number; onLeader: number; onWeak: number; conc: number; concN: number; seats: number; wins: number };
const zero = (): Acc => ({ turns: 0, turnsEarly: 0, fights: 0, fightsEarly: 0, odds: 0, even: 0, onLeader: 0, onWeak: 0, conc: 0, concN: 0, seats: 0, wins: 0 });
function counts(s: GameState) {
  const m = mapDefOf(s.config);
  const terr = s.players.map(() => 0), arm = s.players.map(() => 0);
  for (const t of m.territoryIds) { const x = s.territories[t]; if (x.owner >= 0) { terr[x.owner]++; arm[x.owner] += x.armies; } }
  return { terr, arm };
}
worker((key, i) => {
  const diff = key as 'normal' | 'hard';
  const bag = [...PERS];
  for (let k = 2; k > 0; k--) { const j = hashInts(i, k, 5) % (k + 1); [bag[k], bag[j]] = [bag[j], bag[k]]; }
  bag.push(PERS[hashInts(i, 9) % 3]);
  const c = classicTable(i, 4, { dominationPercent: 70 });
  c.players = c.players.map((p, k) => ({ ...p, difficulty: diff, personality: bag[k] }));
  const acc: Record<string, Acc> = Object.fromEntries(PERS.map((p) => [p, zero()]));
  let lastPlayer = -1;
  const g = playRecorded(c, {
    override: (s, a) => {
      const pers = s.players[s.currentPlayer].personality!;
      const A = acc[pers];
      if (a.type === 'blitz' || a.type === 'attack') {
        const f = s.territories[a.from].armies, d = s.territories[a.to].armies;
        const p = winProbability(f, d);
        A.fights++; if (s.round <= 2) A.fightsEarly++;
        A.odds += p; if (p < 0.65) A.even++;
        const { terr, arm } = counts(s);
        const victim = s.territories[a.to].owner;
        const alive = s.players.filter((x) => !x.eliminated && x.id !== s.currentPlayer);
        const leader = alive.reduce((b, x) => (terr[x.id] > terr[b.id] ? x : b), alive[0]);
        const weak = alive.reduce((b, x) => (arm[x.id] < arm[b.id] ? x : b), alive[0]);
        if (victim === leader.id) A.onLeader++;
        if (victim === weak.id) A.onWeak++;
      }
      if (a.type === 'endTurn' || a.type === 'fortify') {
        const m = mapDefOf(s.config);
        let tot = 0, mx = 0;
        for (const t of m.territoryIds) if (s.territories[t].owner === s.currentPlayer) { tot += s.territories[t].armies; mx = Math.max(mx, s.territories[t].armies); }
        if (tot) { A.conc += mx / tot; A.concN++; }
      }
      return null;
    },
    post: (s, _a, ev) => {
      for (const e0 of ev) if (e0.type === 'turnStarted') { const e = e0 as unknown as { player: number; round: number }; const A = acc[s.players[e.player].personality!]; A.turns++; if (e.round <= 2) A.turnsEarly++; }
    },
  });
  void lastPlayer;
  for (let k = 0; k < 4; k++) { acc[bag[k]].seats++; if (g.winner === k) acc[bag[k]].wins++; }
  return { acc, r: g.rounds };
});
if (!process.env.SIM_KEY) {
  const N = Number(process.argv[2] ?? 1000);
  const diff = process.argv[3] ?? 'normal';
  const rs = await run<{ acc: Record<string, Acc>; r: number }>(diff, N);
  const tot: Record<string, Acc> = Object.fromEntries(PERS.map((p) => [p, zero()]));
  for (const r of rs) for (const p of PERS) for (const k of Object.keys(tot[p]) as (keyof Acc)[]) tot[p][k] += r.acc[p][k];
  console.log(`${diff}, n=${N} games (4 AI seats each)\n| personality | fights/turn | rounds 1–2 | mean odds | near-even (<0.65) | on leader | on weakest | top stack share | win rate (seat-games) |\n|---|---|---|---|---|---|---|---|---|`);
  for (const p of PERS) {
    const A = tot[p];
    console.log(`| ${p} | ${(A.fights / A.turns).toFixed(2)} | ${(A.fightsEarly / A.turnsEarly).toFixed(2)} | ${(A.odds / A.fights).toFixed(2)} | ${pct(A.even, A.fights)} | ${pct(A.onLeader, A.fights)} | ${pct(A.onWeak, A.fights)} | ${(A.conc / A.concN).toFixed(2)} | ${pct(A.wins, A.seats)} (${A.seats}) |`);
  }
}
