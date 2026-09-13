import { analyseCard, AXES, DEFAULT_THRESHOLDS, type CardReport } from '../../src/engine/decisions/balance';
import { CARDS } from '../../src/engine/decisions/registry';
import type { StrategyName } from '../../src/engine/strategies';
import { pad } from './format';
import { configFor, world, type RunOptions } from './run';

export interface BalanceRunOptions {
  cardIds: string[];
  samples: number;
  continuations: number;
  pool: number;
  strategies: StrategyName[];
  run: RunOptions;
}

export function runBalance(opts: BalanceRunOptions, onProgress?: (id: string) => void): CardReport[] {
  const configs = Array.from({ length: opts.pool }, (_, i) => configFor(opts.run.startSeed + i, opts.run));
  const reports: CardReport[] = [];
  for (const cardId of opts.cardIds) {
    onProgress?.(cardId);
    reports.push(
      analyseCard(cardId, world, {
        samples: opts.samples,
        continuations: opts.continuations,
        configs,
        strategies: opts.strategies,
      }),
    );
  }
  return reports;
}

export function allCardIds(): string[] {
  return CARDS.map((c) => c.id);
}

/** The whole card set's health, at a glance. */
export function printHealthTable(reports: CardReport[]): void {
  console.log('');
  console.log(
    pad('card', 26) +
      pad('n', 5, 'r') +
      pad('opts', 6, 'r') +
      '  ' +
      pad('moves', 17, 'r') +
      pad('swing', 9, 'r') +
      pad('d', 7, 'r') +
      pad('t', 7, 'r') +
      '  verdict',
  );
  console.log('-'.repeat(88));
  for (const report of reports) {
    const verdict =
      report.flags.length === 0 ? 'ok' : report.flags.join(' ');
    const axis = report.strongestAxis;
    const swing =
      axis.axis === 'peakMarketValue' || axis.axis === 'earnings'
        ? `${(axis.swing / 1_000_000).toFixed(1)}m`
        : axis.swing.toFixed(1);
    console.log(
      pad(report.cardId, 26) +
        pad(report.samples, 5, 'r') +
        pad(report.options.length, 6, 'r') +
        '  ' +
        pad(axis.axis, 17, 'r') +
        pad(swing, 9, 'r') +
        pad(axis.effectSize.toFixed(2), 7, 'r') +
        pad(axis.t.toFixed(1), 7, 'r') +
        '  ' +
        verdict,
    );
  }
  const failing = reports.filter((r) => r.flags.length > 0);
  console.log('');
  console.log(
    `${reports.length - failing.length}/${reports.length} cards pass  ` +
      `(fails if dominant in > ${(DEFAULT_THRESHOLDS.dominance * 100).toFixed(0)}% of states, ` +
      `dead in > ${(DEFAULT_THRESHOLDS.dead * 100).toFixed(0)}%, ` +
      `or too alike to matter on every axis: d < ${DEFAULT_THRESHOLDS.minEffectSize}). ` +
      `"noisy" means the measurement needs more samples, not that the card is broken.`,
  );
  console.log('');
}

/** Per-option detail for one card. */
export function printCardDetail(report: CardReport): void {
  console.log('');
  console.log(`${report.cardId}  (${report.category})  ${report.samples} states x ${report.continuations} continuations`);
  console.log('-'.repeat(112));
  console.log(
    pad('option', 24) +
      pad('domin', 8, 'r') +
      pad('dead', 7, 'r') +
      AXES.map((a) => pad(a.slice(0, 9), 11, 'r')).join(''),
  );
  for (const option of report.options) {
    console.log(
      pad(option.optionId, 24) +
        pad(`${(option.dominantShare * 100).toFixed(0)}%`, 8, 'r') +
        pad(`${(option.deadShare * 100).toFixed(0)}%`, 7, 'r') +
        AXES.map((axis) => {
          const value = option.means[axis];
          const shown =
            axis === 'peakMarketValue' || axis === 'earnings'
              ? `${(value / 1_000_000).toFixed(1)}m`
              : value.toFixed(1);
          return pad(shown, 11, 'r');
        }).join(''),
    );
  }
  console.log('');
  for (const option of report.options) {
    console.log(`  ${pad(option.optionId, 24)} ${option.label}`);
  }
  console.log('');
  console.log(
    `  moves ${report.strongestAxis.axis} most: swing ${report.strongestAxis.swing.toFixed(1)}, ` +
      `d ${report.strongestAxis.effectSize.toFixed(2)}, t ${report.strongestAxis.t.toFixed(1)}` +
      `   (career score swing ${report.scoreSwing.toFixed(1)})`,
  );
  console.log(`  ${report.flags.length === 0 ? 'ok' : report.flags.join(', ')}`);
  console.log('');
}
