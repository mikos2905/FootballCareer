import { ROLE_LABELS } from '../src/engine/minutes';
import { POSITION_IDS } from '../src/engine/positions';
import { STRATEGY_NAMES, type StrategyName } from '../src/engine/strategies';
import { TIER_LABELS, type EndingTier } from '../src/engine/endings';
import { isCareerAltering } from '../src/engine/injuries';
import type { Cadence, PositionId } from '../src/engine/types';
import { allCardIds, printCardDetail, printHealthTable, runBalance } from './lib/balance';
import { bimodalityFlag, describe, histogram, money, pad, percentile } from './lib/format';
import { metricsFor, runMany, runOne, world, type RunOptions } from './lib/run';
import type { Career } from '../src/engine/career';

/**
 * Tuning harness. No UI, no pixels — this is where the distributions get read
 * and fitted before any of phase 4 exists.
 *
 *   npm run sim -- --seeds 1000 --position ST --strategy greedy --report summary
 *   npm run sim -- --report career --seed 42 --position ST
 *   npm run sim -- --seeds 5000 --report histogram --metric peakSeasonGoals
 */

interface Args {
  seeds: number;
  startSeed: number;
  position: PositionId | 'mixed' | 'outfield';
  strategy: StrategyName | 'mixed';
  nation: string;
  cadence: Cadence;
  report: 'summary' | 'career' | 'histogram' | 'cards' | 'dominance';
  seed: number | null;
  metric: string;
  card: string | null;
  samples: number;
  continuations: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    seeds: 1000,
    startSeed: 1,
    position: 'mixed',
    strategy: 'mixed',
    nation: 'mixed',
    cadence: 'full',
    report: 'summary',
    seed: null,
    metric: 'peakOvr',
    card: null,
    samples: 45,
    continuations: 16,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (!token.startsWith('--')) continue;
    const [flag, inlineValue] = token.slice(2).split('=');
    const value = inlineValue ?? argv[i + 1];
    const consume = () => {
      if (inlineValue === undefined) i += 1;
      return value as string;
    };
    switch (flag) {
      case 'seeds':
        args.seeds = Number(consume());
        break;
      case 'start':
        args.startSeed = Number(consume());
        break;
      case 'position':
        args.position = consume() as Args['position'];
        break;
      case 'strategy':
        args.strategy = consume() as Args['strategy'];
        break;
      case 'nation':
        args.nation = consume();
        break;
      case 'cadence':
        args.cadence = consume() as Cadence;
        break;
      case 'report': {
        // Supports both "--report career --seed 42" and "--report career:42".
        const raw = consume();
        const [name, argument] = raw.split(':');
        args.report = name as Args['report'];
        if (argument !== undefined) {
          if (args.report === 'career') args.seed = Number(argument);
          else args.metric = argument;
        }
        break;
      }
      case 'seed':
        args.seed = Number(consume());
        break;
      case 'metric':
        args.metric = consume();
        break;
      case 'card':
        args.card = consume();
        break;
      case 'samples':
        args.samples = Number(consume());
        break;
      case 'continuations':
        args.continuations = Number(consume());
        break;
      case 'help':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown flag --${flag}`);
    }
  }

  if (args.position !== 'mixed' && args.position !== 'outfield' && !POSITION_IDS.includes(args.position)) {
    throw new Error(`Unknown position ${args.position}. One of: ${POSITION_IDS.join(', ')}, mixed, outfield`);
  }
  if (args.strategy !== 'mixed' && !STRATEGY_NAMES.includes(args.strategy)) {
    throw new Error(`Unknown strategy ${args.strategy}. One of: ${STRATEGY_NAMES.join(', ')}, mixed`);
  }
  return args;
}

function printUsage(): void {
  console.log(`
Usage: npm run sim -- [options]

  --seeds N          how many careers to run           (default 1000)
  --start N          first seed                        (default 1)
  --position P       ${POSITION_IDS.join('|')}|mixed|outfield
  --strategy S       ${STRATEGY_NAMES.join('|')}|mixed
  --nation ID        e.g. eng, bra, mixed              (default mixed)
  --cadence C        full|standard|express             (default full)
  --report R         summary | career | histogram | cards | dominance
  --seed N           which career to print, with --report career
  --metric M         which metric to bin, with --report histogram
  --card ID          which card, with --report dominance
  --samples N        sampled states per card        (default 45)
  --continuations N  futures per state per option   (default 16)

Balance reports are Monte Carlo and cost roughly
samples x options x continuations careers per card.
`);
}

function toOptions(args: Args): RunOptions {
  return {
    seeds: args.seeds,
    startSeed: args.startSeed,
    position: args.position,
    strategy: args.strategy,
    nation: args.nation,
    cadence: args.cadence,
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function share(values: boolean[]): number {
  return values.length === 0 ? 0 : (values.filter(Boolean).length / values.length) * 100;
}

function band(actual: number, low: number, high: number, digits = 1): string {
  const inBand = actual >= low && actual <= high;
  return `${actual.toFixed(digits)}  ${inBand ? 'ok  ' : 'OFF '} target ${low}-${high}`;
}

function reportSummary(args: Args): void {
  const options = toOptions(args);
  const started = Date.now();
  const careers = runMany(options, (done) => process.stderr.write(`\r  ${done}/${options.seeds}`));
  process.stderr.write('\r                    \r');
  const metrics = careers.map(metricsFor);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n=== SUMMARY  ${options.seeds} careers, position=${options.position}, strategy=${options.strategy}, ${elapsed}s ===\n`);

  console.log(describe('career length (seasons)', metrics.map((m) => m.seasons)));
  console.log(describe('retirement age', metrics.map((m) => m.retirementAge)));
  console.log(describe('peak OVR', metrics.map((m) => m.peakOvr)));
  console.log(describe('ceiling OVR', metrics.map((m) => m.ceilingOvr)));
  console.log(describe('realisation', metrics.map((m) => m.realisation), 3));
  console.log(describe('career goals', metrics.map((m) => m.goals)));
  console.log(describe('career assists', metrics.map((m) => m.assists)));
  console.log(describe('appearances', metrics.map((m) => m.appearances)));
  console.log(describe('peak-season goals', metrics.map((m) => m.peakSeasonGoals)));
  console.log(describe('clubs played for', metrics.map((m) => m.clubs)));
  console.log(describe('trophies', metrics.map((m) => m.trophies)));
  console.log(describe('caps', metrics.map((m) => m.caps)));
  console.log(describe('injuries', metrics.map((m) => m.injuries)));
  console.log(describe('peak market value (m)', metrics.map((m) => m.peakValue / 1_000_000)));

  console.log('\n--- tuning targets ---');
  const seasons = metrics.map((m) => m.seasons).sort((a, b) => a - b);
  console.log(`  ${pad('median career length', 30)} ${band(percentile(seasons, 0.5), 16, 18, 1)}`);
  console.log(`  ${pad('reach 90+ OVR', 30)} ${band(share(metrics.map((m) => m.peakOvr >= 90)), 0, 5, 2)}%`);
  console.log(`  ${pad('reach 95+ OVR', 30)} ${band(share(metrics.map((m) => m.peakOvr >= 95)), 0, 1, 2)}%`);
  console.log(`  ${pad('play in a big-five league', 30)} ${band(share(metrics.map((m) => m.reachedTopTier)), 20, 25, 1)}%`);
  console.log(`  ${pad('play in any top flight', 30)} ${share(metrics.map((m) => m.reachedAnyTopFlight)).toFixed(1)}%  (for reference)`);
  console.log(`  ${pad('at least one injury', 30)} ${band(share(metrics.map((m) => m.injuries >= 1)), 99, 100, 1)}%`);
  console.log(`  ${pad('career-altering injury', 30)} ${band(share(metrics.map((m) => m.careerAlteringInjuries >= 1)), 0, 10, 1)}%`);
  console.log(`  ${pad('lost most of a season to injury', 30)} ${share(metrics.map((m) => m.longLayoffs >= 1)).toFixed(1)}%  (for reference)`);
  const clubs = metrics.map((m) => m.clubs).sort((a, b) => a - b);
  console.log(`  ${pad('median clubs played for', 30)} ${band(percentile(clubs, 0.5), 3, 5, 1)}`);

  const strikers = careers.filter((c) => c.config.position === 'ST').map(metricsFor);
  if (strikers.length > 20) {
    const peaks = strikers.map((m) => m.peakSeasonGoals).sort((a, b) => a - b);
    console.log(`\n  strikers only (n=${strikers.length})`);
    console.log(`  ${pad('median peak-season goals', 30)} ${band(percentile(peaks, 0.5), 15, 22, 1)}`);
    console.log(`  ${pad('p95 peak-season goals', 30)} ${band(percentile(peaks, 0.95), 30, 39, 1)}`);
    console.log(`  ${pad('peak season of 40+', 30)} ${share(strikers.map((m) => m.peakSeasonGoals >= 40)).toFixed(2)}%  (want: rare, non-zero)`);
  }

  console.log('\n--- bimodality check (flags need a look, not necessarily a fix) ---');
  for (const [label, values] of [
    ['career length', metrics.map((m) => m.seasons)],
    ['peak OVR', metrics.map((m) => m.peakOvr)],
    ['career goals', metrics.map((m) => m.goals)],
    ['appearances', metrics.map((m) => m.appearances)],
    ['clubs', metrics.map((m) => m.clubs)],
  ] as const) {
    console.log(`  ${pad(label, 20)} ${bimodalityFlag([...values]) ? 'BIMODAL?' : 'unimodal'}`);
  }

  console.log('\n--- how careers ended ---');
  const reasons = new Map<string, number>();
  for (const c of careers) reasons.set(c.endReason, (reasons.get(c.endReason) ?? 0) + 1);
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(reason, 20)} ${pad(count, 7, 'r')} ${pad(`${((count / careers.length) * 100).toFixed(1)}%`, 8, 'r')}`);
  }

  console.log('\n--- ending tiers ---');
  const tiers = new Map<EndingTier, number>();
  for (const c of careers) tiers.set(c.ending.tier, (tiers.get(c.ending.tier) ?? 0) + 1);
  for (const [tier, count] of [...tiers].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(TIER_LABELS[tier], 24)} ${pad(count, 7, 'r')} ${pad(`${((count / careers.length) * 100).toFixed(1)}%`, 8, 'r')}`);
  }

  console.log('\n--- peak division reached ---');
  const divisions = new Map<string, number>();
  for (const c of careers) {
    const best = c.seasons.reduce<string | null>((acc, s) => {
      const league = world.league(s.leagueId);
      if (!acc) return league.id;
      return league.strength > world.league(acc).strength ? league.id : acc;
    }, null);
    const key = best ? world.league(best).name : 'none';
    divisions.set(key, (divisions.get(key) ?? 0) + 1);
  }
  for (const [name, count] of [...divisions].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${pad(name, 24)} ${pad(count, 7, 'r')} ${pad(`${((count / careers.length) * 100).toFixed(1)}%`, 8, 'r')}`);
  }
  console.log('');
}

function reportCareer(args: Args): void {
  const seed = args.seed ?? args.startSeed;
  const career = runOne(seed, toOptions(args));
  printCareer(career);
}

export function printCareer(career: Career): void {
  const p = career.player;
  const keeper = p.position === 'GK';
  console.log('');
  console.log(`${p.surname}, ${p.position} — seed ${career.seedLabel}`);
  console.log(
    `${world.nation(p.nationId).name}  |  #${p.shirtNumber}  |  ${p.foot}-footed  |  peak age ${career.peakAge} (hidden during play)`,
  );
  console.log('');

  const header = keeper
    ? `${pad('Yr', 6)}${pad('Age', 4)}${pad('Club', 24)}${pad('League', 22)}${pad('Pos', 4, 'r')} ${pad('St', 4, 'r')}${pad('Sub', 4, 'r')}${pad('CS', 4, 'r')}${pad('Sv%', 6, 'r')}${pad('Rtg', 6, 'r')}${pad('OVR', 5, 'r')}  Honours`
    : `${pad('Yr', 6)}${pad('Age', 4)}${pad('Club', 24)}${pad('League', 22)}${pad('Pos', 4, 'r')} ${pad('St', 4, 'r')}${pad('Sub', 4, 'r')}${pad('G', 4, 'r')}${pad('A', 4, 'r')}${pad('Rtg', 6, 'r')}${pad('OVR', 5, 'r')}  Honours`;
  console.log(header);
  console.log('-'.repeat(header.length + 8));

  for (const s of career.seasons) {
    const honours = s.trophies.map((t) => t.competitionName).join(', ');
    const injuryNote = s.injuries
      .filter((i) => i.matchesMissed >= 8)
      .map((i) => `${i.label} (${i.matchesMissed})`)
      .join(', ');
    const loanNote = s.onLoanFrom ? ' (loan)' : '';
    const cells = keeper
      ? [
          pad(s.year, 6),
          pad(s.age, 4),
          pad(s.clubName + loanNote, 24),
          pad(s.leagueName, 22),
          pad(s.leaguePosition || '-', 4, 'r'),
          ' ',
          pad(s.starts, 4, 'r'),
          pad(s.substituteAppearances, 4, 'r'),
          pad(s.keeper?.cleanSheets ?? 0, 4, 'r'),
          pad(s.keeper ? (s.keeper.savePercentage * 100).toFixed(1) : '-', 6, 'r'),
          pad(s.averageRating > 0 ? s.averageRating.toFixed(1) : '-', 6, 'r'),
          pad(s.ovrEnd, 5, 'r'),
        ]
      : [
          pad(s.year, 6),
          pad(s.age, 4),
          pad(s.clubName + loanNote, 24),
          pad(s.leagueName, 22),
          pad(s.leaguePosition || '-', 4, 'r'),
          ' ',
          pad(s.starts, 4, 'r'),
          pad(s.substituteAppearances, 4, 'r'),
          pad(s.goals, 4, 'r'),
          pad(s.assists, 4, 'r'),
          pad(s.averageRating > 0 ? s.averageRating.toFixed(1) : '-', 6, 'r'),
          pad(s.ovrEnd, 5, 'r'),
        ];
    const suffix = [honours, injuryNote].filter(Boolean).join('  |  ');
    console.log(`${cells.join('')}  ${suffix}`);
  }

  console.log('');
  console.log(`Ended: ${career.endReason}, age ${career.seasons[career.seasons.length - 1]?.age ?? 16}`);
  console.log(
    `Totals: ${career.totals.appearances} apps, ${career.totals.goals} goals, ${career.totals.assists} assists, ${career.totals.clubsPlayedFor} clubs`,
  );
  console.log(
    `Peak OVR ${career.peakOvr} (ceiling ${career.ending.ceilingOvr}, realised ${(career.ending.realisation * 100).toFixed(0)}%)  |  peak value ${money(career.peakMarketValue)}`,
  );
  if (career.national.caps > 0) {
    console.log(
      `${world.nation(career.national.nationId ?? 'eng').name}: ${career.national.caps} caps, ${career.national.goals} goals, best finish ${career.national.bestFinish ?? '-'}`,
    );
  } else {
    console.log('Never capped.');
  }

  const cabinet = new Map<string, number>();
  for (const t of career.trophies) cabinet.set(t.competitionName, (cabinet.get(t.competitionName) ?? 0) + 1);
  if (cabinet.size > 0) {
    console.log('Cabinet: ' + [...cabinet].map(([name, n]) => `${name} x${n}`).join(', '));
  } else {
    console.log('Cabinet: empty.');
  }

  const altering = career.injuries.filter(isCareerAltering);
  if (altering.length > 0) {
    console.log(
      'Serious injuries: ' +
        altering
          .map((i) => `${i.label} at ${i.age} (${i.matchesMissed} matches${i.permanent ? ', permanent damage' : ''})`)
          .join('; '),
    );
  }

  const standings = [...career.clubStandings].sort((a, b) => b.standing - a.standing).slice(0, 4);
  console.log(
    'Standing: ' +
      standings.map((c) => `${world.club(c.clubId).name} ${Math.round(c.standing)} (${c.seasonsServed}yr)`).join(', '),
  );
  console.log(`Squad role last season: ${ROLE_LABELS[career.seasons[career.seasons.length - 1]?.squadRole ?? 'fringe']}`);
  console.log(`\n${career.ending.label}: ${career.ending.verdict}\n`);
}

function reportHistogram(args: Args): void {
  const careers = runMany(toOptions(args), (done) => process.stderr.write(`\r  ${done}/${args.seeds}`));
  process.stderr.write('\r                    \r');
  const metrics = careers.map(metricsFor);
  const key = args.metric as keyof (typeof metrics)[number];
  const sample = metrics[0]?.[key];
  if (sample === undefined) {
    throw new Error(`Unknown metric "${args.metric}". Try: ${Object.keys(metrics[0] ?? {}).join(', ')}`);
  }
  const values = metrics.map((m) => Number(m[key]));
  console.log(`\n=== ${args.metric}  (${values.length} careers) ===\n`);
  for (const line of histogram(values)) console.log(line);
  console.log('');
  console.log(describe(args.metric, values, 2));
  console.log(`bimodality: ${bimodalityFlag(values) ? 'FLAGGED' : 'unimodal'}\n`);
}

function reportCards(args: Args): void {
  const ids = args.card ? [args.card] : allCardIds();
  const started = Date.now();
  const reports = runBalance(
    {
      cardIds: ids,
      samples: args.samples,
      continuations: args.continuations,
      pool: Math.max(60, args.samples * 3),
      strategies: args.strategy === 'mixed' ? [...STRATEGY_NAMES] : [args.strategy],
      run: toOptions(args),
    },
    (id) => process.stderr.write(`\r  analysing ${pad(id, 26)}`),
  );
  process.stderr.write('\r' + ' '.repeat(40) + '\r');
  printHealthTable(reports);
  console.log(`(${((Date.now() - started) / 1000).toFixed(0)}s)\n`);
}

function reportDominance(args: Args): void {
  if (!args.card) throw new Error('--report dominance needs --card <id>');
  const [report] = runBalance({
    cardIds: [args.card],
    samples: args.samples,
    continuations: args.continuations,
    pool: Math.max(60, args.samples * 3),
    strategies: args.strategy === 'mixed' ? [...STRATEGY_NAMES] : [args.strategy],
    run: toOptions(args),
  });
  if (report) printCardDetail(report);
}

const args = parseArgs(process.argv.slice(2));
if (args.report === 'summary') reportSummary(args);
else if (args.report === 'career') reportCareer(args);
else if (args.report === 'histogram') reportHistogram(args);
else if (args.report === 'cards') reportCards(args);
else if (args.report === 'dominance') reportDominance(args);
else throw new Error(`Unknown report ${args.report}`);
