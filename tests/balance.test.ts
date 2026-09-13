import { describe, expect, it } from 'vitest';
import { analyseCard, AXES, DEFAULT_THRESHOLDS } from '../src/engine/decisions/balance';
import { CARDS } from '../src/engine/decisions/registry';
import { STRATEGY_NAMES } from '../src/engine/strategies';
import { configForSeed, world } from './helpers';

/**
 * The balance suite, run at a sample size the test suite can afford.
 *
 * `npm run sim -- --report cards` is the real measurement; these bands are
 * loosened to match the smaller sample, so this catches a card that has become
 * badly broken rather than one that has drifted a little.
 */
const configs = Array.from({ length: 90 }, (_, i) => configForSeed(i + 1));
const OPTIONS = {
  samples: 14,
  continuations: 6,
  configs,
  strategies: [...STRATEGY_NAMES],
} as const;

const reports = CARDS.map((def) => analyseCard(def.id, world, OPTIONS));

describe('every card is reachable', () => {
  it('comes up in play', () => {
    for (const report of reports) {
      expect(report.samples, `${report.cardId} never became eligible`).toBeGreaterThan(0);
    }
  });
});

describe('no dominant option', () => {
  it('has no option that wins on every axis in most states', () => {
    const broken: string[] = [];
    for (const report of reports) {
      for (const option of report.options) {
        // Looser than the harness: a small sample makes the share noisy.
        if (option.dominantShare > 0.5) {
          broken.push(`${report.cardId}/${option.optionId} dominant in ${(option.dominantShare * 100).toFixed(0)}%`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});

describe('no dead options', () => {
  it('has no option that loses on every axis in most states', () => {
    const dead: string[] = [];
    for (const report of reports) {
      for (const option of report.options) {
        if (option.deadShare > 0.5) {
          dead.push(`${report.cardId}/${option.optionId} dead in ${(option.deadShare * 100).toFixed(0)}%`);
        }
      }
    }
    expect(dead).toEqual([]);
  });
});

describe('no fake decisions', () => {
  it('moves at least one tracked dimension on every card', () => {
    const decoration: string[] = [];
    for (const report of reports) {
      if (report.strongestAxis.effectSize < 0.08) {
        decoration.push(
          `${report.cardId}: best axis ${report.strongestAxis.axis} moves only d=${report.strongestAxis.effectSize.toFixed(2)}`,
        );
      }
    }
    expect(decoration, 'run `npm run sim -- --report cards` for the full measurement').toEqual([]);
  });

  it('trades across at least two dimensions per card', () => {
    // The brief's rule: every option trades off across at least two of the
    // tracked dimensions. A card whose options differ on one axis only is a
    // slider, not a decision.
    const flat: string[] = [];
    for (const report of reports) {
      if (report.options.length < 2) continue;
      const moved = AXES.filter((axis) => {
        const means = report.options.map((o) => o.means[axis]);
        const spread = Math.max(...means) - Math.min(...means);
        const scale = Math.max(...means.map(Math.abs), 1);
        return spread / scale > 0.02;
      });
      if (moved.length < 2) flat.push(`${report.cardId} moves only ${moved.join(', ') || 'nothing'}`);
    }
    expect(flat).toEqual([]);
  });
});

describe('thresholds', () => {
  it('are the ones the harness reports against', () => {
    expect(DEFAULT_THRESHOLDS.dominance).toBeLessThanOrEqual(0.3);
    expect(DEFAULT_THRESHOLDS.dead).toBeLessThanOrEqual(0.3);
    expect(DEFAULT_THRESHOLDS.minEffectSize).toBeGreaterThan(0);
  });
});
