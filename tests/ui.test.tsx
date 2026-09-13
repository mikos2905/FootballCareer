import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/ui/App';
import { play } from '../src/state/driver';
import type { CareerConfig } from '../src/engine/types';

/**
 * Plays a whole career through the DOM, tapping the first option every time.
 *
 * This is the test that makes phases 5 to 7 survivable: it fails the moment a
 * screen stops rendering, a button stops dispatching, or the flow deadlocks.
 */

const SEED = '4021';

/** The same career the engine produces, to check the UI against. */
function expectedCareer() {
  const config: CareerConfig = {
    seed: Number(SEED),
    seedLabel: SEED,
    cadence: 'standard',
    surname: 'Whelan',
    shirtNumber: 9,
    foot: 'right',
    nationId: 'eng',
    position: 'ST',
  };
  const answers: number[] = [];
  let progress = play(config, answers);
  while (progress.prompt) {
    answers.push(0);
    progress = play(config, answers);
  }
  return { career: progress.career!, answers };
}

async function fillCreation(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /quick start/i }));
  await user.type(screen.getByLabelText(/surname/i), 'Whelan');
  await user.click(screen.getByRole('button', { name: /^Striker$/i }));
  await user.type(screen.getByLabelText(/^seed/i), SEED);
  await user.click(screen.getByRole('button', { name: /start career/i }));
}

describe('playing a career in the browser', () => {
  it('goes from creation to the end screen, tapping the first option every time', async () => {
    const user = userEvent.setup();
    const expected = expectedCareer();
    render(<App />);

    expect(screen.getByRole('heading', { name: /football career/i })).toBeInTheDocument();
    await fillCreation(user);

    let taps = 0;
    for (; taps < 400; taps += 1) {
      const ending = screen.queryByRole('heading', { level: 1, name: new RegExp(expected.career.ending.label, 'i') });
      if (ending) break;

      const advance = screen.queryByRole('button', { name: /^continue$/i });
      if (advance) {
        await user.click(advance);
        continue;
      }
      // A decision: take the first option.
      const list = screen.getByRole('list');
      const first = within(list).getAllByRole('button')[0];
      expect(first, 'a decision screen with no options').toBeDefined();
      await user.click(first!);
    }

    expect(taps, 'the career never reached an ending').toBeLessThan(400);
    expect(
      screen.getByRole('heading', { level: 1, name: new RegExp(expected.career.ending.label, 'i') }),
    ).toBeInTheDocument();
    // The end screen shows the career the engine actually produced.
    const value = (label: string) =>
      screen.getByText(label, { selector: 'dt' }).parentElement?.querySelector('dd')?.textContent;
    expect(value('Appearances')).toBe(String(expected.career.totals.appearances));
    expect(value('Peak overall')).toBe(String(expected.career.peakOvr));
    expect(value('Hidden ceiling')).toBe(String(expected.career.ending.ceilingOvr));
    expect(value('Caps')).toBe(String(expected.career.totals.caps));
    expect(screen.getByText(SEED)).toBeInTheDocument();
  }, 120_000);

  it('drafts a ceiling and the eighth pick is forced', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/^seed/i), '77');
    await user.click(screen.getByRole('button', { name: /start drafting/i }));

    for (let pick = 1; pick <= 8; pick += 1) {
      expect(screen.getByText(new RegExp(`Pick ${pick} of 8`))).toBeInTheDocument();
      const list = screen.getAllByRole('list')[0];
      const options = within(list!).getAllByRole('button');
      expect(options.length, `pick ${pick} offered ${options.length} attributes`).toBe(9 - pick);
      if (pick === 8) {
        expect(screen.getByText(/decided for you/i)).toBeInTheDocument();
      }
      await user.click(options[0]!);
    }

    // Eight picks made, so the career has begun.
    expect(screen.queryByText(/Pick \d of 8/)).not.toBeInTheDocument();
  }, 60_000);
});

describe('the flow holds together', () => {
  it('never shows a season the player has not reached, or a stale prompt', () => {
    const config: CareerConfig = {
      seed: 91,
      seedLabel: '91',
      cadence: 'full',
      surname: 'Test',
      shirtNumber: 7,
      foot: 'left',
      nationId: 'esp',
      position: 'AM',
    };
    const answers: number[] = [];
    let previous = 0;
    for (let step = 0; step < 200; step += 1) {
      const progress = play(config, answers);
      // Seasons only ever accumulate.
      expect(progress.seasons.length).toBeGreaterThanOrEqual(previous);
      previous = progress.seasons.length;
      // A career is either waiting on an answer or finished, never both or neither.
      expect(Boolean(progress.prompt) !== Boolean(progress.career)).toBe(true);
      if (!progress.prompt) break;
      expect(progress.prompt.options.length).toBeGreaterThanOrEqual(2);
      answers.push(0);
    }
  });
});

describe('the boundary between components and the engine', () => {
  it('keeps game logic out of components', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');

    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(full) ? [full] : [];
      });

    const offenders: string[] = [];
    for (const file of files(join(process.cwd(), 'src/ui'))) {
      const source = readFileSync(file, 'utf8');
      const name = file.split('/src/')[1];

      // Value imports from the engine or the data layer.
      for (const match of source.matchAll(/^import\s+(?!type\s)([\s\S]*?)from\s+'([^']+)'/gm)) {
        const specifier = match[2] ?? '';
        const clause = match[1] ?? '';
        if (!/engine|\/data/.test(specifier)) continue;
        // `import { type X }` is a type import in all but syntax.
        const values = clause
          .replace(/[{}]/g, '')
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part.length > 0 && !part.startsWith('type '));
        if (values.length > 0) offenders.push(`${name} imports ${values.join(', ')} from ${specifier}`);
      }

      // Arithmetic on game numbers that belongs in the engine.
      for (const banned of ['TUNABLES', 'computeOvr', 'computeMarketValue', 'applyDecision', 'simulateSeason']) {
        if (source.includes(banned)) offenders.push(`${name} references ${banned}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses semantic buttons rather than clickable divs', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? files(full) : /\.tsx$/.test(full) ? [full] : [];
      });

    const offenders: string[] = [];
    for (const file of files(join(process.cwd(), 'src/ui'))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<(div|span|li|p|a)\b[^>]*onClick/g)) {
        offenders.push(`${file.split('/src/')[1]}: <${match[1]}> with onClick`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
