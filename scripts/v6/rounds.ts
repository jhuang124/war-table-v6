// v6 item 6: measured rounds per map for the New game time estimates (src/game/presets.ts ROUNDS_BY_MAP).
// The shipped table: seat 0 a person (proxy: the classic Normal AI) who moves first, the other seats Normal AIs
// with random personalities, standing on, quick deal; played to full conquest, recording the round in which some
// seat first holds 60 / 70 / 75 / 80 / 100 % of the board. Prints a TS literal: [median, p90] per map, seats, %.
// Usage: npx tsx scripts/v6/rounds.ts [n per cell]
import { defaultTable, playRecorded, run, worker, median, q } from './lib';
import { mapDefOf } from '../../src/engine';
import { packIds } from '../../src/map/packs';
const PCTS = [60, 70, 75, 80, 100];
worker((key, i) => {
  const [mapId, n, neutral] = key.split(':');
  // The shipped defaults: capitals (+1) at 3–4 seats (CAPITALS_ON_BY_SEATS in presets.ts).
  const caps = Number(n) >= 3 ? { capitals: { bonus: 1 } } : {};
  const g = playRecorded(defaultTable(i, Number(n), { mapId, dominationPercent: 100, ...caps, ...(neutral ? { neutral: true } : {}) }), { maxRounds: 200 });
  return PCTS.map((p) => g.reach[p] ?? g.rounds);
});
if (!process.env.SIM_KEY) {
  const N = Number(process.argv[2] ?? 400);
  const out: string[] = [];
  for (const mapId of packIds()) {
    const def = mapDefOf({ mapId });
    const rows: string[] = [];
    const cells: [string, string][] = [];
    for (let n = def.rules.seats.min; n <= def.rules.seats.max; n++) cells.push([String(n), `${mapId}:${n}:`]);
    if (def.rules.seats.min <= 2) cells.push(['neutral', `${mapId}:2:1`]);
    for (const [label, key] of cells) {
      const rs = await run<number[]>(key, N);
      const parts = PCTS.map((p, k) => `${p}: [${median(rs.map((r) => r[k]))}, ${q(rs.map((r) => r[k]), 0.9)}]`);
      rows.push(`    ${label === 'neutral' ? "'2n'" : label}: { ${parts.join(', ')} },`);
    }
    out.push(`  '${mapId}': {\n${rows.join('\n')}\n  },`);
  }
  console.log(`// n=${N} games per row\n{\n${out.join('\n')}\n}`);
}
