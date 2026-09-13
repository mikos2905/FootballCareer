import { runMany } from '../lib/run';
import { world } from '../lib/run';

// Dumps the raw shape numbers the tiers match on, so thresholds can be chosen
// against the actual distribution rather than guessed.
const careers = runMany({
  seeds: 1500, startSeed: 1, position: 'mixed', strategy: 'mixed', nation: 'mixed', cadence: 'standard',
});
const rows = careers.map((c) => {
  const best = [...c.clubStandings].sort((a, b) => b.standing - a.standing)[0];
  const homeSeasons = best ? c.seasons.filter((s) => s.clubId === best.clubId).length : 0;
  return {
    bestStanding: best?.standing ?? 1,
    homeShare: homeSeasons / Math.max(1, c.seasons.length),
    homeSeasons,
    trophyWeight: c.totals.trophyWeight,
    trophies: c.totals.trophyCount,
    peakOvr: c.peakOvr,
    ceiling: c.ending.ceilingOvr,
    realised: c.ending.realisation,
    caps: c.totals.caps,
    tournaments: c.national.tournamentsWon,
  };
});
void world;
function pct(values: number[], p: number) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
}
for (const key of ['bestStanding', 'homeShare', 'trophyWeight', 'trophies', 'peakOvr', 'ceiling', 'realised', 'caps', 'tournaments'] as const) {
  const v = rows.map((r) => Number(r[key]));
  console.log(
    key.padEnd(14),
    ['p50', 'p75', 'p90', 'p95', 'p98'].map((l, i) => `${l} ${pct(v, [0.5, 0.75, 0.9, 0.95, 0.98][i]!).toFixed(2)}`).join('  '),
  );
}
const share = (name: string, f: (r: (typeof rows)[number]) => boolean) =>
  console.log(name.padEnd(34), `${((rows.filter(f).length / rows.length) * 100).toFixed(1)}%`);
console.log('');
share('statue 88/.5/7', (r) => r.bestStanding >= 88 && r.homeShare > 0.5 && r.homeSeasons >= 7);
share('superstar 86 & (40caps|700tw)', (r) => r.peakOvr >= 86 && (r.caps >= 40 || r.trophyWeight >= 700));
share('serial 900tw|1tourn', (r) => r.trophyWeight >= 900 || r.tournaments >= 1);
share('serial 420tw|5trophies', (r) => r.trophyWeight >= 420 || r.trophies >= 5 || r.tournaments >= 1);
share('wmhb 72/.8/12', (r) => r.ceiling >= 72 && r.realised < 0.8 && r.ceiling - r.peakOvr >= 12);
share('wmhb 70/.85/9', (r) => r.ceiling >= 70 && r.realised < 0.85 && r.ceiling - r.peakOvr >= 9);
share('cult 68/.3', (r) => r.bestStanding >= 68 && r.homeShare > 0.3);
share('cult 58/.25', (r) => r.bestStanding >= 58 && r.homeShare > 0.25);
