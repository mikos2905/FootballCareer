import { continueCareer, type Career, type CareerPolicy } from '../career';
import { createCareer } from '../creation';
import { substream } from '../rng';
import { makePolicy, type StrategyName } from '../strategies';
import type { CareerConfig, CareerState } from '../types';
import type { World } from '../world';
import { card, isAvailable } from './registry';
import type { Card, PresentedCard } from './types';

/**
 * The balance suite.
 *
 * Three questions about every card, answered by Monte Carlo over seeded
 * continuations rather than by reading the effect list:
 *
 *   Dominance     — is one option best on every axis, in most states?
 *   Dead options  — is one option worst on every axis, in most states?
 *   Fake decision — do the options produce indistinguishable outcomes?
 *
 * The third is the one people forget, and it catches the worst failure in the
 * genre: a game that constantly asks you to choose and never lets it matter.
 *
 * Not exported from the decisions barrel: it imports the career loop, and the
 * career loop imports the barrel.
 */

/** The axes an option is judged on. Higher is better on all of them. */
export interface OutcomeVector {
  careerScore: number;
  peakOvr: number;
  bestClubStanding: number;
  peakMarketValue: number;
  trophies: number;
  caps: number;
  /** Everything he was paid. A career is also a job. */
  earnings: number;
  /** Seasons not wrecked by injury. Negated sense, so higher stays better. */
  seasonsHealthy: number;
}

export const AXES: readonly (keyof OutcomeVector)[] = [
  'careerScore',
  'peakOvr',
  'bestClubStanding',
  'peakMarketValue',
  'trophies',
  'caps',
  'earnings',
  'seasonsHealthy',
];

export function outcomeOf(career: Career): OutcomeVector {
  const wrecked = career.seasons.filter((s) => s.matchesMissed >= 12).length;
  return {
    careerScore: career.ending.careerScore,
    peakOvr: career.peakOvr,
    bestClubStanding: Math.max(0, ...career.clubStandings.map((c) => c.standing)),
    peakMarketValue: career.peakMarketValue,
    trophies: career.totals.trophyCount,
    caps: career.totals.caps,
    earnings: career.totals.earnings,
    seasonsHealthy: career.seasons.length - wrecked,
  };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

export interface SampledState {
  /**
   * The snapshot, held serialised.
   *
   * One walk of the pool fills sixty-one buckets at once, and a mid-career
   * state carries the drifted world with it — a thousand live clones is most
   * of a gigabyte, and the suite was being killed for it. Held as text it is
   * a few tens of megabytes, and parsing one back costs far less than the
   * career we are about to simulate from it.
   */
  readonly stateJson: string;
  config: CareerConfig;
  presented: PresentedCard;
}

/** The snapshot, live again. Each call hands back an independent copy. */
export function stateOf(sample: SampledState): CareerState {
  return JSON.parse(sample.stateJson) as CareerState;
}

/** How many snapshots one career may contribute for a single card. */
const SNAPSHOTS_PER_CAREER = 2;

/**
 * Walks the pool of careers once and snapshots every point at which any card
 * under test comes up.
 *
 * Sampling per card would re-simulate the whole pool sixty-one times over, for
 * states that a single walk already passes through. One walk, every card.
 * Snapshots are deep clones, so branching from one cannot disturb another.
 */
export function sampleAllStates(
  cardIds: readonly string[],
  world: World,
  opts: { configs: readonly CareerConfig[]; strategies: readonly StrategyName[]; limit: number },
  onProgress?: (done: number, total: number) => void,
): Map<string, SampledState[]> {
  const wanted = new Set(cardIds);
  const found = new Map<string, SampledState[]>(cardIds.map((id) => [id, []]));
  const total = opts.configs.length * opts.strategies.length;
  let done = 0;

  for (const config of opts.configs) {
    for (const strategy of opts.strategies) {
      const policy = makePolicy(strategy, config.seed);
      const perCard = new Map<string, number>();

      const observing: CareerPolicy = {
        decide: (request) => {
          const id = request.card.cardId;
          const bucket = found.get(id);
          if (
            bucket !== undefined &&
            wanted.has(id) &&
            bucket.length < opts.limit &&
            (perCard.get(id) ?? 0) < SNAPSHOTS_PER_CAREER
          ) {
            perCard.set(id, (perCard.get(id) ?? 0) + 1);
            bucket.push({ stateJson: JSON.stringify(request.state), config, presented: request.card });
          }
          return policy.decide(request);
        },
        transfer: policy.transfer,
      };

      const initial = createCareer(substream(config.seed, 'creation', 0), config, world);
      continueCareer(initial, world, observing, config);
      done += 1;
      onProgress?.(done, total);

      // Everything is full; no point walking the rest of the pool.
      if ([...found.values()].every((b) => b.length >= opts.limit)) return found;
    }
  }
  return found;
}

/** Single-card sampling, for the CLI's one-card reports. */
export function sampleStates(
  def: Card,
  world: World,
  opts: { configs: readonly CareerConfig[]; strategies: readonly StrategyName[]; limit: number },
): SampledState[] {
  return sampleAllStates([def.id], world, opts).get(def.id) ?? [];
}

// ---------------------------------------------------------------------------
// Branching
// ---------------------------------------------------------------------------

/**
 * Plays the sampled state forward N times with the given option forced, varying
 * the seed each time so the futures differ. Everything before the decision is
 * held identical, so the only difference between two branches is the answer.
 *
 * The answer is forced on *every* later showing of the same card, not just the
 * first. For a card on a three-season cooldown that comes up five times in a
 * career, forcing one instance and letting a policy answer the other four
 * measures almost nothing — and the question a player actually faces is what
 * happens if they keep answering this way.
 */
function branch(
  sample: SampledState,
  world: World,
  optionId: string,
  continuations: number,
  strategy: StrategyName,
): OutcomeVector[] {
  const out: OutcomeVector[] = [];
  for (let n = 0; n < continuations; n += 1) {
    const state = stateOf(sample);
    // A different seed gives a different future; the state up to here is fixed.
    state.seed = (state.seed ^ ((n + 1) * 0x9e3779b1)) >>> 0;
    const base = makePolicy(strategy, state.seed);
    const policy: CareerPolicy = {
      decide: (request) => {
        if (request.card.cardId === sample.presented.cardId) {
          const index = request.card.options.findIndex((o) => o.id === optionId);
          if (index >= 0) return index;
        }
        return base.decide(request);
      },
      transfer: base.transfer,
    };
    out.push(outcomeOf(continueCareer(state, world, policy, sample.config)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface OptionReport {
  optionId: string;
  label: string;
  /** Share of sampled states where this option won on every axis. */
  dominantShare: number;
  /** Share where it lost on every axis. */
  deadShare: number;
  meanScore: number;
  means: OutcomeVector;
}

export interface AxisSwing {
  axis: keyof OutcomeVector;
  /** Gap between the two furthest-apart options, in the axis's own units. */
  swing: number;
  /**
   * That gap measured against the luck a player faces from this point on —
   * the spread of outcomes *within* one sampled state, not across all of them.
   *
   * Pooling across states puts the difference between a sixteen-year-old at a
   * provincial club and a twenty-six-year-old at a giant into the denominator,
   * which is variance the decision was never competing with. The player is
   * standing at one decision point; what they can feel is how far the answer
   * moves them relative to everything else that could happen from there.
   */
  effectSize: number;
  /** That gap in standard errors of the paired difference — whether it is real. */
  t: number;
}

export interface CardReport {
  cardId: string;
  category: string;
  samples: number;
  continuations: number;
  options: OptionReport[];
  /** Largest gap in mean career score between any two options. */
  scoreSwing: number;
  /**
   * The axis this card actually moves, and by how much.
   *
   * Career score alone is the wrong measure: these cards trade across
   * dimensions on purpose, so one that barely moves the final score while
   * swinging club standing or caps is still a real decision.
   */
  strongestAxis: AxisSwing;
  /** Kept for the headline table: effect size on the axis the card moves most. */
  effectSize: number;
  flags: string[];
}

export interface BalanceThresholds {
  dominance: number;
  dead: number;
  /**
   * Below this effect size on every axis, the options do not meaningfully
   * differ and the card is decoration. This is the real test: a player lives
   * one career, so what matters is whether the choice shifts their outcome
   * distribution by an amount they would notice.
   */
  minEffectSize: number;
  /**
   * Below this many standard errors, the measurement is too noisy to trust —
   * which is a reason to sample harder, not to fail the card.
   */
  minT: number;
}

export const DEFAULT_THRESHOLDS: BalanceThresholds = {
  dominance: 0.3,
  dead: 0.3,
  // A single decision among roughly eighteen in a career that shifts the
  // outcome distribution by 0.15 standard deviations of the luck facing the
  // player at that moment is a real decision. Below that it is decoration,
  // however nice the prose is.
  minEffectSize: 0.15,
  // And the difference has to be measurable, not a sampling artefact. Below
  // this the suite is under-sampled rather than the card being broken.
  minT: 2.5,
};

export interface AnalyseOptions {
  samples: number;
  continuations: number;
  configs: readonly CareerConfig[];
  strategies: readonly StrategyName[];
  thresholds?: BalanceThresholds;
  /** States sampled elsewhere, when one walk is serving many cards. */
  sampled?: readonly SampledState[];
}

/**
 * Money is lognormal: a handful of superstar careers earn an order of
 * magnitude more than the median, and on the raw scale their spread swamps
 * every real difference. Compare on the log scale, report in euros.
 */
const LOG_AXES = new Set<keyof OutcomeVector>(['peakMarketValue', 'earnings']);

function scaled(axis: keyof OutcomeVector, value: number): number {
  return LOG_AXES.has(axis) ? Math.log1p(Math.max(0, value)) : value;
}

/** One sampled state's continuations, kept paired by option. */
interface StateResults {
  byOption: Map<string, OutcomeVector[]>;
}

export function analyseCard(cardId: string, world: World, opts: AnalyseOptions): CardReport {
  const def = card(cardId);
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const samples =
    opts.sampled ??
    sampleStates(def, world, {
      configs: opts.configs,
      strategies: opts.strategies,
      limit: opts.samples,
    });

  const empty = (flag: string): CardReport => ({
    cardId,
    category: def.category,
    samples: samples.length,
    continuations: opts.continuations,
    options: [],
    scoreSwing: 0,
    strongestAxis: { axis: 'careerScore', swing: 0, effectSize: 0, t: 0 },
    effectSize: 0,
    flags: [flag],
  });

  if (samples.length === 0) return empty('NEVER ELIGIBLE');

  const optionIds = samples[0]!.presented.options.map((o) => o.id);
  const labels = new Map(samples[0]!.presented.options.map((o) => [o.id, o.label]));
  if (optionIds.length < 2) return empty('SINGLE OPTION');

  const reference = stateOf(samples[0]!);

  // An option that ends the career is worse on every cumulative axis by
  // definition — you stop accruing appearances, trophies and caps the moment
  // you stop playing.
  //
  // So it is exempt from the dead check, and it is also removed from the
  // comparison when judging dominance: carrying on is not a dominant strategy
  // just because it beats stopping on every axis that counts upwards. On a card
  // whose only other option is to retire, that flag fired every time and said
  // nothing about the card.
  const retiringOptions = new Set(
    def
      .options({ state: reference, world, subject: samples[0]!.presented.subject })
      .filter((o) =>
        o
          .effects({ state: reference, world, subject: samples[0]!.presented.subject })
          .some((e) => e.kind === 'retire'),
      )
      .map((o) => o.id),
  );

  const perState: StateResults[] = [];
  const dominantCount = new Map<string, number>(optionIds.map((id) => [id, 0]));
  const deadCount = new Map<string, number>(optionIds.map((id) => [id, 0]));
  let comparableStates = 0;

  for (const sample of samples) {
    const options = sample.presented.options;
    if (options.length < 2) continue;
    const strategy = opts.strategies[comparableStates % opts.strategies.length] ?? 'balanced';

    const byOption = new Map<string, OutcomeVector[]>();
    const meansByOption = options.map((option) => {
      const results = branch(sample, world, option.id, opts.continuations, strategy);
      byOption.set(option.id, results);
      const m = {} as OutcomeVector;
      for (const axis of AXES) m[axis] = mean(results.map((r) => r[axis]));
      return { id: option.id, m };
    });
    perState.push({ byOption });
    comparableStates += 1;

    // Dominant: strictly better than every other option on every axis.
    for (const candidate of meansByOption) {
      const others = meansByOption.filter(
        (o) => o.id !== candidate.id && !retiringOptions.has(o.id),
      );
      if (others.length === 0) continue;
      const dominant = others.every((other) => AXES.every((axis) => candidate.m[axis] >= other.m[axis]))
        && others.some((other) => AXES.some((axis) => candidate.m[axis] > other.m[axis]));
      const dead = others.every((other) => AXES.every((axis) => candidate.m[axis] <= other.m[axis]))
        && others.some((other) => AXES.some((axis) => candidate.m[axis] < other.m[axis]));
      if (dominant) dominantCount.set(candidate.id, (dominantCount.get(candidate.id) ?? 0) + 1);
      if (dead && !retiringOptions.has(candidate.id)) {
        deadCount.set(candidate.id, (deadCount.get(candidate.id) ?? 0) + 1);
      }
    }
  }

  const allOf = (id: string): OutcomeVector[] => perState.flatMap((s) => s.byOption.get(id) ?? []);

  const options: OptionReport[] = optionIds.map((id) => {
    const results = allOf(id);
    const means = {} as OutcomeVector;
    for (const axis of AXES) means[axis] = mean(results.map((r) => r[axis]));
    return {
      optionId: id,
      label: labels.get(id) ?? id,
      dominantShare: comparableStates === 0 ? 0 : (dominantCount.get(id) ?? 0) / comparableStates,
      deadShare: comparableStates === 0 ? 0 : (deadCount.get(id) ?? 0) / comparableStates,
      meanScore: means.careerScore,
      means,
    };
  });

  const scores = options.map((o) => o.meanScore);
  const scoreSwing = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0;

  // Which dimension does this card actually move? Take the strongest, since
  // the cards trade across dimensions rather than all pushing career score.
  //
  // Branch n of option A and branch n of option B start from the same cloned
  // state with the same derived seed, so they are matched pairs: everything
  // except the answer is held fixed. Differencing them removes the state and
  // the luck in one step, which is what makes a once-per-career card
  // measurable at all.
  let strongestAxis: AxisSwing = { axis: 'careerScore', swing: 0, effectSize: 0, t: 0 };
  for (const axis of AXES) {
    // The two options that end up furthest apart, chosen on pooled means so
    // the pair is not cherry-picked state by state.
    let high = optionIds[0]!;
    let low = optionIds[0]!;
    let best = -Infinity;
    let worst = Infinity;
    for (const id of optionIds) {
      const m = mean(allOf(id).map((r) => scaled(axis, r[axis])));
      if (m > best) { best = m; high = id; }
      if (m < worst) { worst = m; low = id; }
    }
    if (high === low) continue;

    const diffs: number[] = [];
    const rawDiffs: number[] = [];
    for (const state of perState) {
      const a = state.byOption.get(high);
      const b = state.byOption.get(low);
      if (!a || !b) continue;
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i += 1) {
        diffs.push(scaled(axis, a[i]![axis]) - scaled(axis, b[i]![axis]));
        rawDiffs.push(a[i]![axis] - b[i]![axis]);
      }
    }
    if (diffs.length < 2) continue;

    // The luck a player faces from one decision point, not the spread across
    // all the different careers we sampled from.
    const withinState: number[] = [];
    for (const state of perState) {
      for (const id of optionIds) {
        const results = state.byOption.get(id);
        if (results && results.length >= 2) {
          withinState.push(variance(results.map((r) => scaled(axis, r[axis]))));
        }
      }
    }
    const sd = Math.sqrt(mean(withinState));
    if (sd <= 0) continue;

    const meanDiff = mean(diffs);
    const standardError = Math.sqrt(variance(diffs) / diffs.length);
    const candidate: AxisSwing = {
      axis,
      swing: mean(rawDiffs),
      effectSize: Math.abs(meanDiff) / sd,
      t: standardError > 0 ? Math.abs(meanDiff) / standardError : 0,
    };
    if (candidate.effectSize > strongestAxis.effectSize) strongestAxis = candidate;
  }

  const flags: string[] = [];

  // Dominance is only worth asking about once the card moves something.
  //
  // The check is "better on every axis", and the axes move together: an option
  // that is one per cent better is better on all eight, so a card whose options
  // are indistinguishable reads as perfectly dominant. That is not a balance
  // problem, it is the same nothing the fake-decision check already found, and
  // reporting it twice sends you off tuning a card whose real fault is that it
  // does not matter either way.
  if (strongestAxis.effectSize < thresholds.minEffectSize) {
    flags.push('FAKE');
  } else {
    for (const option of options) {
      if (option.dominantShare > thresholds.dominance) flags.push(`DOMINANT:${option.optionId}`);
      if (option.deadShare > thresholds.dead) flags.push(`DEAD:${option.optionId}`);
    }
    if (strongestAxis.t < thresholds.minT) flags.push('noisy');
  }

  return {
    cardId,
    category: def.category,
    samples: samples.length,
    continuations: opts.continuations,
    options,
    scoreSwing,
    strongestAxis,
    effectSize: strongestAxis.effectSize,
    flags,
  };
}

/** True when a card can be drawn at all in the given state. */
export function couldShow(state: CareerState, def: Card): boolean {
  return isAvailable(state, def);
}
