# Phase 3 — the decision system

## No magnitude lives in a card

Every effect size references a named tunable in `src/engine/decisions/tunables.ts`. Cards read
as design intent; retuning the decision layer is editing one file. A test greps the card
modules for bare `amount:`/`value:`/`chance:` literals and fails on any it finds.

## Effects are data

Four kinds, all declarative so the balance suite can reason about them:

- **immediate** — a delta applied now.
- **modifier** — a named, durational multiplier or offset on `minutes`, `development`,
  `injuryRisk`, `standing` or training `focus`, with a duration and a source id. The season
  simulation reads these while they are alive. The folded result is bounded, because modifiers
  multiply and three overlapping minutes bonuses would otherwise override the simulation.
- **delayed** — pushed onto a queue that is part of game state and serialisable, firing N
  seasons later. Club-targeted effects capture the club id when queued, so a delayed hit lands
  where it was aimed even after a transfer.
- **probabilistic** — draws from `substream(seed, 'decisions', season)`, never a shared stream.

`applyDecision(state, cardId, optionId, rng, world, subject) -> outcome` is pure: it clones,
applies, and returns a new state. The queue drains at the start of each season, before the
simulation runs.

## Triggering

1. A due scheduled beat takes priority and is answered by a card that names that beat.
2. Otherwise every eligible card is weighted and one is drawn from the decisions substream.
   Cards already seen this run are down-weighted.
3. If nothing is eligible, the seasonal fallback runs. A silent season feels broken.

Cards that answer a beat are held out of the general draw until that beat has fired — otherwise
a seventeen-year-old who has played four games is handed the international allegiance decision.

## The balance suite

`npm run sim -- --report cards` samples states where each card comes up, branches every option
N times to retirement with the seed varied and everything before the decision held identical,
and scores the resulting outcome vectors.

Axes: career score, peak OVR, best club standing, peak market value, trophies, caps, career
earnings, seasons not wrecked by injury.

- **Dominance** — an option best on every axis in more than 30% of states fails.
- **Dead option** — worst on every axis in more than 30% of states fails.
- **Fake decision** — measured per axis, not on career score alone, because these cards trade
  across dimensions on purpose. A card whose strongest axis moves less than d = 0.15 is
  decoration. `t` is reported alongside: below 2.5 the measurement is under-sampled, which is a
  reason to sample harder rather than to fail the card.

## Playing it in the terminal

```
npm run cards -- --seed 1234
npm run cards -- --seed 1234 --choices 0,1,0,2   # non-interactive replay
```

Both card decisions and transfer windows are the player's. Every career prints the choice list
that reproduces it.
