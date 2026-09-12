import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE_DIR = join(process.cwd(), 'src/engine');

function engineFiles(dir = ENGINE_DIR): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? engineFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

/**
 * The ESLint rule is the first line of defence. This is the second, because a
 * disabled rule or an eslint-disable comment would slip past it.
 */
describe('engine purity', () => {
  const files = engineFiles();

  it('finds engine sources to check', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it.each([
    ['Math.random', /Math\s*\.\s*random/],
    ['Math["random"]', /Math\s*\[\s*['"`]random['"`]\s*\]/],
    ['Date.now', /Date\s*\.\s*now/],
    ['new Date', /new\s+Date\b/],
    ['crypto randomness', /crypto\s*\.\s*(getRandomValues|randomUUID)/],
    ['DOM access', /\b(document|window|localStorage)\s*\./],
    ['network or storage I/O', /\b(fetch|XMLHttpRequest|require)\s*\(/],
  ])('contains no %s', (_label, pattern) => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      // Ignore the ban messages in comments that name the thing being banned.
      const withoutComments = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      return pattern.test(withoutComments);
    });
    expect(offenders).toEqual([]);
  });

  it('imports nothing from React, the DOM, or the data layer', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const specifier = match[1]!;
        const external = !specifier.startsWith('.');
        if (external || specifier.includes('/data') || specifier.includes('/ui') || specifier.includes('/state')) {
          offenders.push(`${file}: ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has an ESLint rule banning Math.random in the engine', () => {
    const config = readFileSync(join(process.cwd(), 'eslint.config.js'), 'utf8');
    expect(config).toMatch(/src\/engine\/\*\*\/\*\.ts/);
    expect(config).toMatch(/no-restricted-properties/);
    expect(config).toMatch(/property:\s*'random'/);
  });
});

describe('the ESLint ban actually fires', () => {
  it('rejects Math.random() written into src/engine', async () => {
    const { execFileSync } = await import('node:child_process');
    const { writeFileSync, rmSync } = await import('node:fs');
    const probe = join(ENGINE_DIR, '__lint_probe.ts');
    writeFileSync(probe, 'export const roll = (): number => Math.random();\n');
    try {
      let failed = false;
      let output = '';
      try {
        execFileSync('npx', ['eslint', probe], { encoding: 'utf8', stdio: 'pipe' });
      } catch (error) {
        failed = true;
        const err = error as { stdout?: string; stderr?: string };
        output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
      }
      expect(failed, 'eslint accepted Math.random() inside src/engine').toBe(true);
      expect(output).toMatch(/Math\.random/);
    } finally {
      rmSync(probe, { force: true });
    }
  }, 30_000);
});
