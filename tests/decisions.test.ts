import { describe, expect, it } from 'vitest';
import { runCareer } from '../src/engine/career';
import { CARDS, card, present, prepare, selectCard } from '../src/engine/decisions/registry';
import { applyDecision } from '../src/engine/decisions/resolve';
import { drainQueue, expireModifiers, resolveModifiers } from '../src/engine/decisions/effects';
import { TUNABLES } from '../src/engine/decisions/tunables';
import { createCareer } from '../src/engine/creation';
import { substream } from '../src/engine/rng';
import { makePolicy } from '../src/engine/strategies';
import { configForSeed, world } from './helpers';

function freshState(seed: number) {
  return createCareer(substream(seed, 'creation', 0), configForSeed(seed), world);
}

describe('card set', () => {
  it('covers the whole career with the set the brief asks for', () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(60);
    expect(CARDS.length).toBeLessThanOrEqual(80);
    for (const id of [
      'first-contract',
      'bench-at-a-giant',
      'loan-or-fight',
      'derby-half-fit',
      'captains-armband',
      'agent-wants-gulf',
      'new-manager',
      'training-focus',
      'nationality-choice',
      'testimonial-or-one-more',
    ]) {
      expect(() => card(id), id).not.toThrow();
    }
  });

  it('gives every card two to four options', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = freshState(seed);
      for (const def of CARDS) {
        const ctx = prepare(def, state, world, substream(seed, 'decisions', 0));
        // A card that is not eligible is never shown, so it is not required to
        // produce a sensible option list for that state.
        if (!def.eligibility(ctx)) continue;
        const options = def.options(ctx);
        expect(options.length, def.id).toBeGreaterThanOrEqual(2);
        expect(options.length, def.id).toBeLessThanOrEqual(4);
        expect(new Set(options.map((o) => o.id)).size, `${def.id} has duplicate option ids`).toBe(options.length);
      }
    }
  });

  it('writes text that names the actual club rather than a placeholder', () => {
    // Walk real careers and check every card as it is actually presented.
    const seen = new Set<string>();
    const presentedCards: { id: string; presented: ReturnType<typeof present> }[] = [];
    for (let seed = 1; seed <= 60 && seen.size < CARDS.length; seed += 1) {
      const state = freshState(seed);
      const rng = substream(seed, 'decisions', 0);
      for (const def of CARDS) {
        const ctx = prepare(def, state, world, rng);
        if (!def.eligibility(ctx)) continue;
        seen.add(def.id);
        presentedCards.push({ id: def.id, presented: present(def, ctx) });
      }
    }
    expect(presentedCards.length).toBeGreaterThan(20);
    for (const { id, presented } of presentedCards) {
      const def = card(id);
      expect(presented.title.length, def.id).toBeGreaterThan(8);
      expect(presented.situation.length, def.id).toBeGreaterThan(80);
      for (const bad of ['undefined', 'NaN', '[object', 'null']) {
        expect(presented.situation.includes(bad), `${def.id}: ${presented.situation}`).toBe(false);
        expect(presented.title.includes(bad), def.id).toBe(false);
      }
      for (const option of presented.options) {
        expect(option.label.length, `${def.id}/${option.id}`).toBeGreaterThan(3);
        expect(option.label.includes('undefined'), `${def.id}/${option.id}`).toBe(false);
      }
    }
  });

  it('keeps every magnitude in the tunables table, not in the cards', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src/engine/decisions/cards');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'helpers.ts')) {
      const source = readFileSync(join(dir, file), 'utf8');
      // Strip comments and string literals, then look for bare numbers being
      // used as effect magnitudes.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/`[^`]*`/g, '``')
        .replace(/'[^']*'/g, "''");
      const offenders = [...code.matchAll(/\b(amount|value|chance|seasons):\s*(-?\d+(?:\.\d+)?)/g)]
        .map((m) => `${file}: ${m[1]}: ${m[2]}`)
        // `seasons` durations and small structural numbers are legible as-is;
        // it is the magnitudes that have to be named.
        .filter((entry) => !entry.includes('seasons:'));
      expect(offenders, `magnitudes belong in TUNABLES`).toEqual([]);
    }
  });

  it('exposes every tunable as a finite number', () => {
    for (const [key, value] of Object.entries(TUNABLES)) {
      expect(Number.isFinite(value), key).toBe(true);
    }
  });
});

describe('applyDecision', () => {
  it('is pure — the input state is untouched', () => {
    const state = freshState(11);
    const before = JSON.stringify(state);
    const rng = substream(11, 'decisions', 0);
    const selection = selectCard(state, world, [], rng);
    const presented = present(selection.def, selection.ctx);
    applyDecision(state, presented.cardId, presented.options[0]!.id, rng, world, presented.subject);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('is deterministic for the same rng position', () => {
    const state = freshState(12);
    const presented = present(
      card('training-focus'),
      prepare(card('training-focus'), state, world, substream(12, 'decisions', 0)),
    );
    const run = () =>
      JSON.stringify(
        applyDecision(state, 'training-focus', presented.options[0]!.id, substream(12, 'decisions', 3), world, presented.subject)
          .state,
      );
    expect(run()).toBe(run());
  });

  it('rejects an option the card does not have', () => {
    const state = freshState(13);
    expect(() =>
      applyDecision(state, 'training-focus', 'not-an-option', substream(13, 'decisions', 0), world),
    ).toThrow();
  });

  it('records what was shown and chosen, enough to replay it', () => {
    const state = freshState(14);
    const rng = substream(14, 'decisions', 0);
    const selection = selectCard(state, world, [], rng);
    const presented = present(selection.def, selection.ctx);
    const outcome = applyDecision(state, presented.cardId, presented.options[1]!.id, rng, world, presented.subject);
    const shown = outcome.state.cardHistory.at(-1);
    expect(shown?.cardId).toBe(presented.cardId);
    expect(shown?.optionId).toBe(presented.options[1]!.id);
    expect(shown?.optionIndex).toBe(1);
  });
});

describe('the delayed queue', () => {
  it('fires each queued effect exactly once', () => {
    const state = freshState(21);
    state.pending.push({
      id: 'test:1',
      dueSeason: state.season,
      source: 'test',
      label: 'it lands',
      effects: [{ kind: 'immediate', change: { reputation: 5 } }],
    });
    const before = state.player.reputation;
    const rng = substream(21, 'decisions', 0);
    expect(drainQueue(state, rng)).toEqual(['it lands']);
    expect(state.player.reputation).toBeCloseTo(before + 5, 6);
    // Drained, so a second pass does nothing.
    expect(drainQueue(state, rng)).toEqual([]);
    expect(state.player.reputation).toBeCloseTo(before + 5, 6);
  });

  it('lands a club-standing effect at the club it was aimed at, after a transfer', () => {
    const state = freshState(22);
    const original = state.clubId;
    const rng = substream(22, 'decisions', 0);
    // Queue a delayed hit against "the club I am at now".
    const outcome = applyDecision(
      state,
      'first-contract',
      'push-wage',
      rng,
      world,
      prepare(card('first-contract'), state, world, rng).subject,
    );
    const next = outcome.state;
    const queued = next.pending.find((p) => p.source === 'first-contract');
    expect(queued, 'nothing was queued').toBeDefined();

    // Move him somewhere else before it lands.
    const other = world.data.clubs.find((c) => c.id !== original)!;
    next.clubId = other.id;
    next.clubStandings.push({
      clubId: other.id,
      standing: 50,
      goodwill: 0,
      seasonsServed: 0,
      appearances: 0,
      goals: 0,
      assists: 0,
      trophiesWon: 0,
      leftForMoney: false,
    });
    const standingAtNew = next.clubStandings.find((s) => s.clubId === other.id)!.standing;
    const standingAtOld = next.clubStandings.find((s) => s.clubId === original)!.standing;

    next.season = queued!.dueSeason;
    drainQueue(next, rng);

    expect(next.clubStandings.find((s) => s.clubId === other.id)!.standing).toBe(standingAtNew);
    expect(next.clubStandings.find((s) => s.clubId === original)!.standing).toBeLessThan(standingAtOld);
  });

  it('survives a round trip through JSON, because it is part of game state', () => {
    const state = freshState(23);
    state.pending.push({
      id: 'test:2',
      dueSeason: state.season + 2,
      source: 'test',
      label: 'later',
      effects: [{ kind: 'immediate', change: { wear: 5 } }],
    });
    const revived = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(revived.pending).toEqual(state.pending);
  });
});

describe('modifiers', () => {
  it('expire when their time is up', () => {
    const state = freshState(31);
    const rng = substream(31, 'decisions', 0);
    applyDecision(state, 'training-focus', 'sharpen', rng, world, prepare(card('training-focus'), state, world, rng).subject);
    const next = applyDecision(
      state,
      'training-focus',
      'sharpen',
      rng,
      world,
      prepare(card('training-focus'), state, world, rng).subject,
    ).state;
    expect(next.modifiers.length).toBeGreaterThan(0);
    const longest = Math.max(...next.modifiers.map((m) => m.expiresAfterSeason));
    next.season = longest + 1;
    expireModifiers(next);
    expect(next.modifiers).toEqual([]);
  });

  it('never lets stacked modifiers overwhelm the simulation', () => {
    const state = freshState(32);
    for (let i = 0; i < 6; i += 1) {
      state.modifiers.push({
        id: `m${i}`,
        source: `s${i}`,
        channel: 'minutes',
        value: 1.6,
        seasons: 4,
        label: 'stacked',
        expiresAfterSeason: state.season + 3,
      });
    }
    const resolved = resolveModifiers(state);
    expect(resolved.minutesFactor).toBeLessThanOrEqual(1.45);
    expect(resolved.minutesFactor).toBeGreaterThan(1);
  });

  it('does not stack the same channel from the same source on itself', () => {
    const state = freshState(33);
    const rng = substream(33, 'decisions', 0);
    let current = state;
    for (let i = 0; i < 3; i += 1) {
      current = applyDecision(
        current,
        'training-focus',
        'sharpen',
        rng,
        world,
        prepare(card('training-focus'), current, world, rng).subject,
      ).state;
    }
    const byChannel = current.modifiers.filter((m) => m.source === 'training-focus' && m.channel === 'development');
    expect(byChannel.length).toBe(1);
  });
});

describe('careers driven by cards', () => {
  it('shows a decision most seasons and never repeats itself pointlessly', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const career = runCareer(configForSeed(seed), world, makePolicy('balanced', seed));
      expect(career.decisions.length, `seed ${seed}`).toBeGreaterThan(career.seasons.length * 0.5);
      const distinct = new Set(career.decisions.map((d) => d.cardId)).size;
      expect(distinct, `seed ${seed} saw only ${distinct} distinct cards`).toBeGreaterThanOrEqual(4);
    }
  });

  it('respects oncePerCareer', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const career = runCareer(configForSeed(seed), world, makePolicy('random', seed));
      for (const def of CARDS.filter((c) => c.oncePerCareer)) {
        const count = career.decisions.filter((d) => d.cardId === def.id).length;
        expect(count, `seed ${seed}: ${def.id} fired ${count} times`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('respects cooldowns', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const career = runCareer(configForSeed(seed), world, makePolicy('random', seed));
      for (const def of CARDS.filter((c) => c.cooldownSeasons)) {
        const seasons = career.decisions.filter((d) => d.cardId === def.id).map((d) => d.season);
        for (let i = 1; i < seasons.length; i += 1) {
          expect(seasons[i]! - seasons[i - 1]!, `seed ${seed}: ${def.id}`).toBeGreaterThanOrEqual(
            def.cooldownSeasons!,
          );
        }
      }
    }
  });

  it('stays deterministic with the decision layer in place', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const a = runCareer(configForSeed(seed), world, makePolicy('balanced', seed));
      const b = runCareer(configForSeed(seed), world, makePolicy('balanced', seed));
      expect(JSON.stringify(b), `seed ${seed}`).toBe(JSON.stringify(a));
    }
  });

  it('changes the career when one decision changes', () => {
    const seed = 77;
    const base = makePolicy('balanced', seed);
    const run = (flip: boolean) => {
      let seen = 0;
      return runCareer(configForSeed(seed), world, {
        decide: (r) => {
          seen += 1;
          if (flip && seen === 2) return (base.decide(r) + 1) % r.card.options.length;
          return base.decide(r);
        },
        transfer: base.transfer,
      });
    };
    expect(JSON.stringify(run(true))).not.toBe(JSON.stringify(run(false)));
  });
});
