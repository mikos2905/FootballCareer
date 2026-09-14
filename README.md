# Football Career

A single-player football career simulator that runs entirely in the browser. Create a
footballer at 16, make a handful of career decisions, and the game simulates the seasons
in between until retirement.

No accounts, no backend, no downloads.

## Status: phase 5 complete

The build runs in phases, stopping for review after each one.

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Engine skeleton, PRNG, determinism tests | **done** |
| 2 | Season simulation and development curves, tuned from a CLI harness | **done** |
| 3 | Decision system, ten cards, trade-off test | **done** |
| 4 | Minimal React UI, mobile portrait, end to end | **done** |
| 5 | Full decision card set, endings, verdict text | **done** |
| 6 | End screen, share card, share URL | not started |
| 7 | Visual design pass | not started |

## The determinism contract

One seeded PRNG (mulberry32), in `src/engine/rng.ts`. Same seed plus same decision
sequence produces a byte-identical career.

Draws are taken from **named substreams**, derived from the master seed, the subsystem
name and the season index (xmur3 into mulberry32):

```
substream(masterSeed, "injuries", season)
substream(masterSeed, "transfers", season)
substream(masterSeed, "matches", season)
substream(masterSeed, "development", season)
substream(masterSeed, "national", season)
substream(masterSeed, "leagueTables", season)
substream(masterSeed, "creation", 0)
```

A single shared stream would mean that adding one draw anywhere shifted every downstream
result for every existing seed, which makes tuning impossible — you cannot tell a balance
change from a stream shift. With substreams, a change inside the injury model cannot
perturb the transfer market.

This is enforced three ways:

- `tests/determinism.test.ts` runs a fixed seed and decision list twice and deep-equals the
  result, then repeats across 100 seeds.
- `eslint.config.js` bans `Math.random`, `Date.now`, `new Date`, DOM globals, I/O and React
  imports inside `src/engine/`.
- `tests/purity.test.ts` greps the engine sources for the same things, and then writes
  `Math.random()` into `src/engine/` and asserts that ESLint actually rejects it.

Outcomes are draws around an expectation, never flat probability tables. `Rng.around()`
takes a mean computed from game state plus a bounded spread. Counts — goals, assists —
use `overdispersed()`, a gamma-Poisson mixture parameterised by variance as a multiple of
the mean rather than by a fixed dispersion constant: Poisson is too tight to give football
its hot and cold seasons, but a fixed dispersion overdoes it badly at high means, which is
how you get sixty-goal seasons.

## Architecture

```
src/engine/   pure TypeScript. no React, no DOM, no I/O. state + decision -> new state
src/data/     league, club, competition and nation JSON
src/ui/       React components, presentation only
src/state/    the bridge holding the engine and driving the loop
```

`src/engine/` never imports from `src/data/`. The engine is handed a `WorldData` and builds
an indexed `World` from it. Swapping every real name for fictional ones is a change to four
JSON files and nothing else — `tests/data.test.ts` proves it by renaming the entire data set
and rebuilding the world.

Data carries text names only. No crests, kits, competition marks or player likenesses.

## Scales and conventions

| Quantity | Scale |
| --- | --- |
| Attributes | 1-99 integers (carried as floats between seasons, rounded for display) |
| OVR | 1-99, **always derived** from attributes and position, never stored as truth |
| Club strength | 1-99, on the same scale as OVR: a club of strength 78 is one where a 78-OVR player is a regular |
| Club prestige | 1-99, how attractive the club is — deliberately not the same thing as strength |
| League strength | a multiplier, 0.60 (third tier) to 1.00 (strongest), scaling both difficulty and visibility |
| Ages | 16 to 40. Retirement is a decision; forced above 40, and impossible below 20 |

Season length is 38 league matches plus cup and continental fixtures, abstracted rather
than simulated individually.

## Commands

```
npm test           vitest, all suites (includes the balance suite)
npm run lint       eslint, including the engine purity rules
npm run typecheck  tsc --noEmit

npm run sim -- --seeds 1000 --position ST --strategy greedy --report summary
npm run sim -- --report career --seed 2666
npm run sim -- --seeds 5000 --report histogram --metric peakSeasonGoals
npm run sim -- --report cards                    card health table, all cards
npm run sim -- --report dominance --card derby-half-fit
npm run cards -- --seed 1234                    play one career in the terminal

npm run dev                 the game in a browser, phone portrait
npx tsx scripts/probe.ts    print the model's expectations for archetypal inputs
npx tsx scripts/pick.ts     find representative careers by career score
```

See `docs/phase-2.md` for the simulation layer, `docs/phase-3.md` for the decision system
and `docs/phase-4.md` for the UI.

Strategies (`greedy`, `loyal`, `random`, `balanced`) are stand-in decision policies for
tuning only. Phase 3 replaces them with decision cards the player answers.

## Known gaps, by design

- **Ten cards are still decoration.** The balance suite measures whether a card's options
  actually produce different careers; thirty-five of sixty-one clear the bar, ten move nothing
  measurable, and the rest are real but small. `npm test` names the ten. See `docs/phase-5.md`
  for what the measurement does and `npm run sim -- --report cards` for the full table.
- **Cadence is a difficulty setting.** Big-five reach is 29.9% / 26.1% / 20.6% at full,
  standard and express cadence: more decisions means more agency means a better career. The
  20-25% band is only met at the slower cadences. Either card magnitudes get normalised by
  cadence, or the coupling is accepted and the band restated — a design call, not a bug to
  quietly tune away.
- **Club standing still saturates for the best careers.** It converges on an earned target
  now rather than accumulating with tenure, but the top decile still reaches 99.
- **The UI is deliberately ugly.** Tailwind defaults and no animation until phase 7. The end
  screen is a stub; phase 6 builds the real one with the share card and share URL.
