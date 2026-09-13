import { continueCareer, type Career, type CareerPolicy } from '../career';
import { createCareer } from '../creation';
import { substream } from '../rng';
import { makePolicy, type StrategyName } from '../strategies';
import type { CareerConfig, CareerState } from '../types';
import type { World } from '../world';
import { card, isAvailable } from './registry';
import { cloneState } from './resolve';
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
  state: CareerState;
  config: CareerConfig;
  presented: PresentedCard;
}

/**
 * Walks careers and snapshots every point at which the card under test comes
 * up. Snapshots are deep clones, so branching from one cannot disturb another.
 */
export function sampleStates(
  def: Card,
  world: World,
  opts: { configs: readonly CareerConfig[]; strategies: readonly StrategyName[]; limit: number },
): SampledState[] {
  const found: SampledState[] = [];

  for (const config of opts.configs) {
    if (found.length >= opts.limit) break;
    for (const strategy of opts.strategies) {
      if (found.length >= opts.limit) break;
      const policy = makePolicy(strategy, config.seed);
      const capture: SampledState[] = [];

      const observing: CareerPolicy = {
        decide: (request) => {
          // At most two snapshots per career, so one long run cannot dominate
          // the sample with correlated states.
          if (request.card.cardId === def.id && capture.length < 2) {
            capture.push({ state: cloneState(request.state), config, presented: request.card });
          }
          return policy.decide(request);
        },
        transfer: policy.transfer,
      };

      const initial = createCareer(substream(config.seed, 'creation', 0), config, world);
      continueCareer(initial, world, observing, config);
      found.push(...capture);
    }
  }
  return found.slice(0, opts.limit);
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
    const state = cloneState(sample.state);
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
  /** Gap between the best and worst option's mean on this axis. */
  swing: number;
  /** That gap in pooled standard deviations — how big it is. */
  effectSize: number;
  /** That gap in standard errors — whether it is real. */
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
  // outcome distribution by 0.15 standard deviations is a real decision.
  // Below that it is decoration, however nice the prose is.
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
}

export function analyseCard(cardId: string, world: World, opts: AnalyseOptions): CardReport {
  const def = card(cardId);
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const samples = sampleStates(def, world, {
    configs: opts.configs,
    strategies: opts.strategies,
    limit: opts.samples,
  });

  if (samples.length === 0) {
    return {
      cardId,
      category: def.category,
      samples: 0,
      continuations: opts.continuations,
      options: [],
      scoreSwing: 0,
      strongestAxis: { axis: 'careerScore', swing: 0, effectSize: 0, t: 0 },
      effectSize: 0,
      flags: ['NEVER ELIGIBLE'],
    };
  }

  const optionIds = samples[0]!.presented.options.map((o) => o.id);
  const labels = new Map(samples[0]!.presented.options.map((o) => [o.id, o.label]));

  // An option that ends the career is worse on every cumulative axis by
  // definition — you stop accruing appearances, trophies and caps the moment
  // you stop playing. Flagging it "dead" says nothing about the card, so it is
  // exempt from that check. It is still held to the dominance check.
  const retiringOptions = new Set(
    def
      .options({ state: samples[0]!.state, world, subject: samples[0]!.presented.subject })
      .filter((o) =>
        o
          .effects({ state: samples[0]!.state, world, subject: samples[0]!.presented.subject })
          .some((e) => e.kind === 'retire'),
      )
      .map((o) => o.id),
  );

  const perOption = new Map<string, OutcomeVector[]>(optionIds.map((id) => [id, []]));
  const dominantCount = new Map<string, number>(optionIds.map((id) => [id, 0]));
  const deadCount = new Map<string, number>(optionIds.map((id) => [id, 0]));
  let comparableStates = 0;

  for (const sample of samples) {
    const options = sample.presented.options;
    if (options.length < 2) continue;
    const strategy = opts.strategies[comparableStates % opts.strategies.length] ?? 'balanced';

    const meansByOption = options.map((option) => {
      const results = branch(sample, world, option.id, opts.continuations, strategy);
      const bucket = perOption.get(option.id);
      if (bucket) bucket.push(...results);
      const m = {} as OutcomeVector;
      for (const axis of AXES) m[axis] = mean(results.map((r) => r[axis]));
      return { id: option.id, m };
    });
    comparableStates += 1;

    // Dominant: strictly better than every other option on every axis.
    for (const candidate of meansByOption) {
      const others = meansByOption.filter((o) => o.id !== candidate.id);
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

  const options: OptionReport[] = optionIds.map((id) => {
    const results = perOption.get(id) ?? [];
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
  let strongestAxis: AxisSwing = { axis: 'careerScore', swing: 0, effectSize: 0, t: 0 };
  for (const axis of AXES) {
    const means = options.map((o) => o.means[axis]);
    if (means.length < 2) continue;
    const swing = Math.max(...means) - Math.min(...means);
    const pooledVariance = mean(
      optionIds.map((id) => variance((perOption.get(id) ?? []).map((r) => r[axis]))),
    );
    const sd = Math.sqrt(pooledVariance);
    if (sd <= 0) continue;
    const n = mean(optionIds.map((id) => (perOption.get(id) ?? []).length));
    const standardError = sd * Math.sqrt(2 / Math.max(1, n));
    const candidate: AxisSwing = {
      axis,
      swing,
      effectSize: swing / sd,
      t: standardError > 0 ? swing / standardError : 0,
    };
    if (candidate.effectSize > strongestAxis.effectSize) strongestAxis = candidate;
  }

  const flags: string[] = [];
  for (const option of options) {
    if (option.dominantShare > thresholds.dominance) flags.push(`DOMINANT:${option.optionId}`);
    if (option.deadShare > thresholds.dead) flags.push(`DEAD:${option.optionId}`);
  }
  if (strongestAxis.effectSize < thresholds.minEffectSize) flags.push('FAKE');
  else if (strongestAxis.t < thresholds.minT) flags.push('noisy');
  if (strongestAxis.effectSize >= thresholds.minEffectSize && strongestAxis.t < thresholds.minT) {
    // Real but under-measured: sample harder before believing either way.
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
