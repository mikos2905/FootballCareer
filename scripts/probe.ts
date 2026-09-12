import { FULL_SEASON_MINUTES, ageMultiplier, minutesFactorFor } from '../src/engine/development';
import { injuryHazard } from '../src/engine/injuries';
import { ageStandingAdjustment, shareForStanding, totalMatchesFor } from '../src/engine/minutes';
import {
  creatingModifier,
  finishingModifier,
  leagueDifficultyModifier,
  teamAttackModifier,
} from '../src/engine/output';
import { position } from '../src/engine/positions';
import type { Attributes } from '../src/engine/types';
import { pad } from './lib/format';

/**
 * Model probe. Prints the expectations the season models produce for
 * archetypal inputs, so the constants get fitted against numbers rather than
 * against a feeling about the summary report.
 *
 *   npx tsx scripts/probe.ts
 */

const flat = (value: number, shooting = value, passing = value): Attributes => ({
  pace: value,
  shooting,
  passing,
  dribbling: value,
  defending: value,
  physical: value,
  flair: value,
  weakFoot: value,
});

console.log('\n=== expected goals per season, striker ===\n');
console.log(
  pad('shooting', 10) +
    pad('club', 8) +
    pad('lgAvg', 8) +
    pad('lgMult', 8) +
    pad('fin', 8) +
    pad('team', 8) +
    pad('diff', 8) +
    pad('per90', 8) +
    pad('mins', 8) +
    pad('E[goals]', 10),
);
console.log('-'.repeat(82));

const scenarios: [string, number, number, number, number, number][] = [
  // label-ish: shooting, clubStrength, leagueAverage, leagueMultiplier, minutes
  ['elite at a giant, top league', 95, 90, 76, 1.0, 3200],
  ['elite at a giant, weak league', 95, 74, 58, 0.72, 3200],
  ['good at a good club', 82, 80, 76, 1.0, 3000],
  ['average top-flight starter', 70, 72, 76, 1.0, 2700],
  ['average, second tier', 62, 60, 58, 0.77, 2700],
  ['poor, third tier', 52, 50, 50, 0.6, 2400],
  ['fringe at a giant', 74, 90, 76, 1.0, 700],
];

for (const [label, shooting, club, lgAvg, lgMult, minutes] of scenarios) {
  const pos = position('ST');
  const attrs = flat(shooting - 8, shooting, shooting - 10);
  const fin = finishingModifier(attrs);
  const team = teamAttackModifier(club, lgAvg, pos.teamAttackSensitivity);
  const diff = leagueDifficultyModifier(lgMult);
  const raw = pos.goalsPer90 * fin * team * diff;
  // The engine caps an expectation at twice the position baseline.
  const per90 = Math.min(raw, pos.goalsPer90 * 2.0);
  console.log(
    pad(String(shooting), 10) +
      pad(String(club), 8) +
      pad(String(lgAvg), 8) +
      pad(lgMult.toFixed(2), 8) +
      pad(fin.toFixed(2), 8) +
      pad(team.toFixed(2), 8) +
      pad(diff.toFixed(2), 8) +
      pad(per90.toFixed(3) + (per90 < raw ? '*' : ''), 8) +
      pad(String(minutes), 8) +
      pad(((per90 * minutes) / 90).toFixed(1), 10) +
      `  ${label}`,
  );
}

console.log('\n=== assists per season, attacking midfield ===\n');
for (const [label, passing, club, lgAvg, lgMult, minutes] of scenarios) {
  const pos = position('AM');
  const attrs = flat(passing - 6, passing - 10, passing);
  const create = creatingModifier(attrs);
  const team = teamAttackModifier(club, lgAvg, pos.teamAttackSensitivity);
  const diff = leagueDifficultyModifier(lgMult);
  const per90 = Math.min(pos.assistsPer90 * create * team * diff, pos.assistsPer90 * 2.0);
  console.log(
    `${pad(per90.toFixed(3), 8)} per90   ${pad(((per90 * minutes) / 90).toFixed(1), 6)} assists   ${label}`,
  );
}

console.log('\n=== minutes: standing to share ===\n');
for (const standing of [-16, -12, -8, -5, -2, 0, 2, 5, 8, 12]) {
  const share = shareForStanding(standing);
  console.log(
    `${pad(standing, 6, 'r')}  share ${pad((share * 100).toFixed(1) + '%', 8, 'r')}  of 46 matches -> ~${pad(Math.round(46 * 90 * share), 5, 'r')} minutes`,
  );
}

console.log('\n=== age adjustment to standing ===\n');
console.log(
  [16, 17, 18, 19, 20, 21, 23, 25, 28, 30, 32, 34, 36, 38]
    .map((age) => `${age}: ${ageStandingAdjustment(age).toFixed(1)}`)
    .join('   '),
);

console.log('\n=== development: age multiplier (peak 27) ===\n');
console.log(
  [16, 18, 20, 22, 24, 26, 27, 29, 31, 33, 35]
    .map((age) => `${age}: ${ageMultiplier(age, 27).toFixed(3)}`)
    .join('   '),
);

console.log('\n=== development: minutes gate ===\n');
console.log(
  [0, 300, 600, 1200, 1800, 2400, 3000, 3600]
    .map((m) => `${m}: ${minutesFactorFor(m).toFixed(2)}`)
    .join('   '),
);
console.log(`(a full season is ${FULL_SEASON_MINUTES} minutes)`);

console.log('\n=== injury hazard (expected injuries per season) ===\n');
for (const [label, age, proneness, wear, physical, share] of [
  ['young, robust, playing', 21, 25, 10, 75, 0.8],
  ['prime, average', 27, 35, 35, 68, 0.9],
  ['prime, fragile', 27, 65, 45, 55, 0.9],
  ['veteran, worn', 34, 45, 75, 60, 0.7],
  ['squad player', 24, 35, 20, 65, 0.25],
] as const) {
  const hazard = injuryHazard({
    attributes: flat(physical),
    position: 'ST',
    age,
    injuryProneness: proneness,
    wear,
    totalMatches: totalMatchesFor(true, 2),
    intendedShare: share,
    riskFactor: 1,
  });
  console.log(`  ${pad(label, 26)} ${hazard.toFixed(2)}   P(no injury) = ${Math.exp(-hazard).toFixed(3)}`);
}
console.log('');
