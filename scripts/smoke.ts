import { WORLD_DATA } from '../src/data';
import { buildWorld, validateWorld } from '../src/engine/world';
import { runCareer, scriptedChooser } from '../src/engine/career';
import { ceilingOvr } from '../src/engine/ratings';

const problems = validateWorld(WORLD_DATA);
if (problems.length) {
  console.error('data problems:', problems.slice(0, 10));
  process.exit(1);
}
const world = buildWorld(WORLD_DATA);

for (const seed of [1, 2, 7, 42, 1234]) {
  const career = runCareer(
    { seed, seedLabel: String(seed), cadence: 'full', surname: 'Test', shirtNumber: 9, foot: 'right', nationId: 'eng', position: 'ST' },
    world,
    scriptedChooser([0, 1, 0, 2, 1, 0, 0, 1]),
  );
  const first = career.seasons[0]!;
  const last = career.seasons[career.seasons.length - 1]!;
  console.log(
    `seed ${String(seed).padStart(5)} | seasons ${String(career.seasons.length).padStart(2)} | start ${first.clubName} (${first.leagueName}) | end ${last.clubName} age ${last.age}`,
  );
  console.log(
    `        peakOVR ${career.peakOvr} ceilOVR ${ceilingOvr(career.player.ceiling, career.player.position)} | goals ${career.totals.goals} assists ${career.totals.assists} apps ${career.totals.appearances} | trophies ${career.totals.trophyCount} | caps ${career.totals.caps} | value €${(career.peakMarketValue / 1e6).toFixed(0)}m | ${career.ending.label}`,
  );
}
