import { metricsFor, runOne, type RunOptions } from './lib/run';
import { pad } from './lib/format';

/**
 * Finds representative careers to read end to end: a good one, a median one
 * and a bad one, ranked by career score.
 *
 *   npx tsx scripts/pick.ts [count]
 */
const count = Number(process.argv[2] ?? 2000);
const options: RunOptions = {
  seeds: count,
  startSeed: 1,
  position: 'mixed',
  strategy: 'mixed',
  nation: 'mixed',
  cadence: 'full',
};

const rows = Array.from({ length: count }, (_, i) => {
  const seed = i + 1;
  const career = runOne(seed, options);
  return { seed, career, m: metricsFor(career), score: career.ending.careerScore };
}).sort((a, b) => a.score - b.score);

const at = (p: number) => rows[Math.min(rows.length - 1, Math.floor(rows.length * p))]!;

console.log(`\nscanned ${count} careers, mixed positions and strategies\n`);
console.log(
  pad('label', 12) + pad('seed', 8) + pad('pos', 6) + pad('score', 8) + pad('tier', 22) + pad('peakOVR', 9) + pad('seasons', 9) + pad('end', 12),
);
console.log('-'.repeat(90));
for (const [label, p] of [
  ['bad (p05)', 0.05],
  ['poor (p20)', 0.2],
  ['median', 0.5],
  ['good (p85)', 0.85],
  ['great (p99)', 0.99],
] as const) {
  const r = at(p);
  console.log(
    pad(label, 12) +
      pad(r.seed, 8) +
      pad(r.career.config.position, 6) +
      pad(r.score, 8) +
      pad(r.career.ending.label, 22) +
      pad(r.career.peakOvr, 9) +
      pad(r.career.seasons.length, 9) +
      pad(r.career.endReason, 12),
  );
}
console.log('');
