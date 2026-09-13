import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { continueCareer, type CareerPolicy, type DecisionRequest, type TransferRequest } from '../src/engine/career';
import { createCareer } from '../src/engine/creation';
import { ROLE_LABELS } from '../src/engine/minutes';
import { POSITION_IDS } from '../src/engine/positions';
import { Rng, substream } from '../src/engine/rng';
import { makePolicy } from '../src/engine/strategies';
import type { Cadence, CareerConfig, Foot, PositionId, SeasonRecord } from '../src/engine/types';
import { money, pad } from './lib/format';
import { world } from './lib/run';
import { WORLD_DATA } from '../src/data';

/**
 * Play one career in the terminal, reading the actual card text.
 *
 *   npm run cards -- --seed 1234
 *   npm run cards -- --seed 1234 --choices 0,1,0,2   (non-interactive replay)
 *
 * If it is not interesting here, styling will not save it.
 */

interface Args {
  seed: number;
  position: PositionId | 'random';
  nation: string;
  cadence: Cadence;
  surname: string;
  choices: number[] | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    seed: Math.floor(Date.now() % 100000),
    position: 'random',
    nation: 'random',
    cadence: 'full',
    surname: '',
    choices: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (!token.startsWith('--')) continue;
    const [flag, inline] = token.slice(2).split('=');
    const value = inline ?? argv[i + 1];
    const take = () => {
      if (inline === undefined) i += 1;
      return value as string;
    };
    if (flag === 'seed') args.seed = Number(take());
    else if (flag === 'position') args.position = take() as PositionId;
    else if (flag === 'nation') args.nation = take();
    else if (flag === 'cadence') args.cadence = take() as Cadence;
    else if (flag === 'surname') args.surname = take();
    else if (flag === 'choices') args.choices = take().split(',').map((n) => Number(n.trim()));
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const setup = new Rng(args.seed ^ 0xc0ffee);
const config: CareerConfig = {
  seed: args.seed,
  seedLabel: String(args.seed),
  cadence: args.cadence,
  surname: args.surname || `Seed${args.seed}`,
  shirtNumber: setup.int(1, 99),
  foot: setup.pick(['left', 'right'] as Foot[]),
  nationId: args.nation === 'random' ? setup.pick(WORLD_DATA.nations).id : args.nation,
  position: args.position === 'random' ? setup.pick(POSITION_IDS) : args.position,
};

const RULE = '─'.repeat(72);

function wrap(text: string, width = 72): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function printSeason(s: SeasonRecord): void {
  const keeper = s.keeper;
  const line = keeper
    ? `${s.year}  age ${s.age}  ${s.clubName} (${s.leagueName})  ${s.starts} starts, ${keeper.cleanSheets} clean sheets, ${(keeper.savePercentage * 100).toFixed(1)}% saves`
    : `${s.year}  age ${s.age}  ${s.clubName} (${s.leagueName})  ${s.appearances} apps, ${s.goals} goals, ${s.assists} assists`;
  console.log(`  ${line}`);
  const detail = [
    `finished ${s.leaguePosition || '-'}`,
    s.averageRating > 0 ? `rating ${s.averageRating.toFixed(1)}` : 'barely played',
    `OVR ${s.ovrEnd}`,
    ROLE_LABELS[s.squadRole].toLowerCase(),
  ];
  if (s.caps > 0) detail.push(`${s.caps} caps`);
  console.log(`         ${detail.join(' · ')}`);
  for (const t of s.trophies) console.log(`         *** ${t.competitionName} ***`);
  for (const injury of s.injuries.filter((i) => i.matchesMissed >= 6)) {
    console.log(`         ! ${injury.label}, ${injury.matchesMissed} matches`);
  }
  for (const event of s.events) console.log(`         > ${event}`);
}

async function main(): Promise<void> {
  const rl = args.choices ? null : createInterface({ input: stdin, output: stdout });
  let scripted = 0;
  let lastSeasonShown = -1;

  console.log('');
  console.log(RULE);
  console.log(
    `  ${config.surname}, ${config.position}, ${world.nation(config.nationId).name}   ·   seed ${config.seedLabel}`,
  );
  console.log(RULE);

  const fallback = makePolicy('balanced', args.seed);

  const ask = async (request: DecisionRequest): Promise<number> => {
    // Catch the table up to this decision.
    for (const s of request.state.seasons) {
      if (s.season > lastSeasonShown) {
        printSeason(s);
        lastSeasonShown = s.season;
      }
    }

    const { card } = request;
    console.log('');
    console.log(RULE);
    console.log(`  ${card.title.toUpperCase()}`);
    console.log(`  ${request.year} · age ${request.age}`);
    console.log('');
    for (const line of wrap(card.situation, 68)) console.log(`  ${line}`);
    console.log('');
    card.options.forEach((option, i) => {
      console.log(`  [${i + 1}] ${option.label}`);
      for (const line of wrap(option.detail, 64)) console.log(`      ${line}`);
    });
    console.log('');

    if (args.choices) {
      const pick = args.choices[scripted] ?? 0;
      scripted += 1;
      const chosen = card.options[Math.min(pick, card.options.length - 1)];
      console.log(`  > ${chosen?.label ?? ''}`);
      return pick;
    }

    for (;;) {
      const answer = (await rl!.question(`  Your choice [1-${card.options.length}]: `)).trim();
      const n = Number(answer);
      if (Number.isInteger(n) && n >= 1 && n <= card.options.length) return n - 1;
      console.log('  Pick a number.');
    }
  };

  const askTransfer = async (request: TransferRequest): Promise<number> => {
    for (const s of request.state.seasons) {
      if (s.season > lastSeasonShown) {
        printSeason(s);
        lastSeasonShown = s.season;
      }
    }
    console.log('');
    console.log(RULE);
    console.log('  THE SUMMER WINDOW');
    console.log(`  ${request.year} · age ${request.age}`);
    console.log('');
    const club = world.club(request.state.clubId);
    const lines = request.mustMove
      ? `You are out of contract and ${club.name} have not offered you a new one. You need a club.`
      : `You are at ${club.name} with ${request.state.contractYearsRemaining} ${request.state.contractYearsRemaining === 1 ? 'year' : 'years'} to run. Your agent has been busy.`;
    for (const line of wrap(lines, 68)) console.log(`  ${line}`);
    console.log('');

    request.offers.forEach((offer, i) => {
      const confidence =
        offer.projectionConfidence === 'firm'
          ? 'and they mean it'
          : offer.projectionConfidence === 'likely'
            ? 'or so they say'
            : 'though clubs that size change their minds';
      console.log(`  [${i + 1}] ${offer.loan ? 'Loan to ' : ''}${offer.clubName} — ${offer.leagueName}`);
      console.log(
        `      ${ROLE_LABELS[offer.role]}, ${money(offer.wage)} a year, ${offer.contractYears}-year deal`,
      );
      console.log(
        `      They say about ${Math.round(offer.projectedMinutes / 90)} matches' worth of football, ${confidence}.`,
      );
    });
    const stayIndex = request.offers.length + 1;
    if (!request.mustMove) {
      console.log(`  [${stayIndex}] Stay at ${club.name}${request.renewal ? ' and sign the new deal' : ''}`);
    }
    console.log('');

    const toIndex = (n: number) => (n === stayIndex ? -1 : n - 1);
    if (args.choices) {
      const pick = args.choices[scripted] ?? (request.mustMove ? 0 : stayIndex - 1);
      scripted += 1;
      const bounded = Math.min(pick, stayIndex - 1);
      const chosen = request.offers[bounded];
      console.log(`  > ${chosen ? `${chosen.clubName}` : `Stay at ${club.name}`}`);
      return request.mustMove ? Math.min(bounded, request.offers.length - 1) : toIndex(bounded + 1);
    }
    const max = request.mustMove ? request.offers.length : stayIndex;
    for (;;) {
      const answer = (await rl!.question(`  Your choice [1-${max}]: `)).trim();
      const n = Number(answer);
      if (Number.isInteger(n) && n >= 1 && n <= max) return toIndex(n);
      console.log('  Pick a number.');
    }
  };

  const policy: CareerPolicy = { decide: () => 0, transfer: fallback.transfer };

  // The engine's choosers are synchronous, so answers are collected by replaying
  // the career: each pass answers one more prompt than the last. Careers are
  // deterministic, so every replay reproduces exactly what the player saw.
  // Card decisions and transfer windows share one answer list, in call order.
  const answers: number[] = [];
  let career = null as ReturnType<typeof continueCareer> | null;

  for (;;) {
    let index = 0;
    let pendingCard: DecisionRequest | null = null;
    let pendingTransfer: TransferRequest | null = null;

    const next = (): number | null => {
      if (index < answers.length) {
        const answer = answers[index] as number;
        index += 1;
        return answer;
      }
      index += 1;
      return null;
    };

    policy.decide = (request) => {
      const answer = next();
      if (answer !== null) return answer;
      if (!pendingCard && !pendingTransfer) pendingCard = request;
      return 0;
    };
    policy.transfer = (request) => {
      // Nothing to decide when nobody wants him and he can stay put.
      if (request.offers.length === 0) return -1;
      const answer = next();
      if (answer !== null) return answer;
      if (!pendingCard && !pendingTransfer) pendingTransfer = request;
      return request.mustMove ? 0 : -1;
    };

    const initial = createCareer(substream(config.seed, 'creation', 0), config, world);
    career = continueCareer(initial, world, policy, config);
    if (pendingCard) answers.push(await ask(pendingCard));
    else if (pendingTransfer) answers.push(await askTransfer(pendingTransfer));
    else break;
  }

  for (const s of career.seasons) {
    if (s.season > lastSeasonShown) {
      printSeason(s);
      lastSeasonShown = s.season;
    }
  }

  console.log('');
  console.log(RULE);
  console.log(`  ${career.ending.label.toUpperCase()}`);
  console.log('');
  for (const line of wrap(career.ending.verdict, 68)) console.log(`  ${line}`);
  console.log('');
  console.log(
    `  ${career.totals.appearances} apps · ${career.totals.goals} goals · ${career.totals.assists} assists · ` +
      `${career.totals.caps} caps · ${career.totals.clubsPlayedFor} clubs`,
  );
  console.log(
    `  peak OVR ${career.peakOvr} (ceiling ${career.ending.ceilingOvr}) · peak value ${money(career.peakMarketValue)} · ` +
      `earned ${money(career.totals.earnings)}`,
  );
  const cabinet = new Map<string, number>();
  for (const t of career.trophies) cabinet.set(t.competitionName, (cabinet.get(t.competitionName) ?? 0) + 1);
  console.log(
    `  ${cabinet.size > 0 ? [...cabinet].map(([n, k]) => `${n} x${k}`).join(', ') : 'No trophies.'}`,
  );
  console.log(`  Ended: ${career.endReason}, age ${career.endAge}`);
  console.log(`  Replay: npm run cards -- --seed ${config.seedLabel} --choices ${answers.join(',')}`);
  console.log(RULE);
  console.log('');
  void pad;
  rl?.close();
}

main();
