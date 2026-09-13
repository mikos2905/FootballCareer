import { CARDS } from './registry';
import { STAGES, type Card, type Category, type Stage } from './types';

/**
 * Stage by category coverage.
 *
 * A career that reaches a stage with nothing to say falls back to generic
 * cards, and that is where a run starts feeling thin. Combinations that are
 * genuinely not a thing in football are exempted by name below, rather than
 * quietly tolerated.
 */

export const CATEGORIES: readonly Category[] = [
  'contract',
  'transfer',
  'loan',
  'dressing-room',
  'training',
  'injury',
  'lifestyle',
  'international',
  'loyalty',
  'retirement',
];

/** Cells that are deliberately empty, with the reason. */
export const EXEMPT: Record<string, string> = {
  'youth:retirement': 'Nobody retires at seventeen.',
  'breakthrough:retirement':
    'Careers that end at this age end by attrition — nobody wanting you — rather than by choosing to stop.',
  'prime:retirement': 'The retirement beat does not open until 33, so there is nothing to decide.',
  'prime:loan': 'A loan in your prime is an emergency cover deal, too rare to write a card about.',
  'decline:loan': 'By this age a loan and a transfer are the same conversation, and the transfer cards have it.',
  'twilight:loan': 'Nobody loans a thirty-five-year-old.',
  'twilight:training': 'Development has stopped by now, so a training focus has nothing to act on.',
};

export interface CoverageCell {
  stage: Stage;
  category: Category;
  cards: Card[];
  exemptReason: string | null;
}

export function coverageMatrix(): CoverageCell[] {
  const cells: CoverageCell[] = [];
  for (const stage of STAGES) {
    for (const category of CATEGORIES) {
      cells.push({
        stage,
        category,
        cards: CARDS.filter((c) => c.stages.includes(stage) && c.category === category),
        exemptReason: EXEMPT[`${stage}:${category}`] ?? null,
      });
    }
  }
  return cells;
}

/** Cells with no card and no documented reason. */
export function coverageGaps(): CoverageCell[] {
  return coverageMatrix().filter((cell) => cell.cards.length === 0 && cell.exemptReason === null);
}
