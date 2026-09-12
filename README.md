# Football Career

A single-player football career simulator that runs entirely in the browser. Create a
footballer at 16, make a handful of career decisions, and the game simulates the seasons
in between until retirement.

No accounts, no backend, no downloads.

## Status: phase 1 complete

The build runs in phases, stopping for review after each one.

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Engine skeleton, PRNG, determinism tests | **done** |
| 2 | Season simulation and development curves, tuned from a CLI harness | not started |
| 3 | Decision system, ten cards, trade-off test | not started |
| 4 | Minimal React UI, mobile portrait, end to end | not started |
| 5 | Full decision card set, endings, verdict text | not started |
| 6 | End screen, share card, share URL | not started |
| 7 | Visual design pass | not started |

## The determinism contract

One seeded PRNG (mulberry32) per run, in `src/engine/rng.ts`. The entire simulation draws
from that single stream in a strictly deterministic order. Same seed plus same decision
sequence produces a byte-identical career.

This is enforced three ways:

- `tests/determinism.test.ts` runs a fixed seed and decision list twice and deep-equals the
  result, then repeats across 100 seeds.
- `eslint.config.js` bans `Math.random`, `Date.now`, `new Date`, DOM globals, I/O and React
  imports inside `src/engine/`.
- `tests/purity.test.ts` greps the engine sources for the same things, and then writes
  `Math.random()` into `src/engine/` and asserts that ESLint actually rejects it.

Outcomes are draws around an expectation, never flat probability tables. `Rng.around()` and
`Rng.aroundSkewed()` take a mean computed from game state plus a bounded spread, so a
striker can have a bad year without a 40-goal season becoming reachable for a third-tier
player.

## Architecture

```
src/engine/   pure TypeScript. no React, no DOM, no I/O. state + decision -> new state
src/data/     league, club, competition and nation JSON
src/ui/       React components, presentation only        (phase 4)
src/state/    the bridge holding the engine and driving the loop   (phase 4)
```

`src/engine/` never imports from `src/data/`. The engine is handed a `WorldData` and builds
an indexed `World` from it. Swapping every real name for fictional ones is a change to four
JSON files and nothing else — `tests/data.test.ts` proves it by renaming the entire data set
and rebuilding the world.

Data carries text names only. No crests, kits, competition marks or player likenesses.

## Commands

```
npm test           vitest, all suites
npm run lint       eslint, including the engine purity rules
npm run typecheck  tsc --noEmit
npx tsx scripts/smoke.ts   run five careers end to end and print the summary
```

## Known gaps, by design

These are later phases, not bugs, but they make phase 1 output look odd if you run the
smoke script:

- **No transfers yet.** The transfer-window beat is scheduled and fires, but no card
  answers it until phase 3, so every player stays at their first club for a whole career
  and almost every run ends in the Statue tier.
- **No promotion or relegation.** A club's league is static data, so a strong club in a
  third tier wins that division repeatedly. Moving league membership into career state is
  phase 2 work.
- **No international football.** The national-team beat fires but has no card, so nobody
  ever commits to a nation and caps stay at zero.
- **Distributions are untuned.** Every constant in `season.ts`, `development.ts` and
  `endings.ts` is a plausible first guess. Phase 2 fits them against the targets in the
  brief from a CLI harness, before any pixels exist.
