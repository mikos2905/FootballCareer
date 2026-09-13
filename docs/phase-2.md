# Phase 2 — season simulation and development curves

Reference for what the simulation layer settled on. Phase 3 and later build on these.

## Substreams

`BRIEF.md` asks for one seeded PRNG. Phase 2 refines that: draws come from named substreams
derived from the master seed, the subsystem name and the season index (xmur3 into mulberry32).

```
substream(masterSeed, "creation", 0)
substream(masterSeed, "injuries" | "transfers" | "matches"
                     | "development" | "national" | "leagueTables"
                     | "decisions", season)
```

A single shared stream means adding one draw anywhere shifts every downstream result for
every existing seed, so you cannot tell a balance change from a stream shift. With
substreams, a change inside the injury model cannot perturb the transfer market.

## Scales

| Quantity | Scale |
| --- | --- |
| Attributes | 1-99 integers (carried as floats between seasons, rounded for display) |
| OVR | 1-99, **always derived** from attributes and position, never stored as truth |
| Club strength | 1-99, same scale as OVR: strength 78 is a club where a 78-OVR player is a regular |
| Club prestige | 1-99, how attractive the club is — deliberately not the same as strength |
| League strength | multiplier, 0.60 (third tier) to 1.00 (strongest); scales difficulty and visibility |
| Ages | 16 to 40; retirement is a decision, forced above 40, impossible below 20 |

Season length is 38 league matches plus cup and continental fixtures, abstracted rather than
simulated individually.

## Subsystems

- `minutes.ts` — squad standing from a **selection rating** (not OVR) against club strength,
  adjusted for age, manager relationship and form, mapped to a share of available minutes and
  split into starts and substitute appearances. Minutes are the spine: everything downstream
  hangs off them.
- `output.ts` — expectations from finishing/creating modifiers, team attacking strength and
  league difficulty, drawn from an overdispersed gamma-Poisson. Goalkeepers have a separate
  model: clean sheets, save percentage, shots faced.
- `injuries.ts` — per-season hazard from physical, wear, age and risk decisions; severity
  weighted to the minor, with a thin tail of permanent damage to pace or physical.
- `league.ts` — league tables drawn from club strength rather than fixture by fixture, with
  promotion, relegation, knockout cups and season-to-season club strength drift.
- `transfers.ts` — candidate filtering by level, visibility and wages; two to four bidders;
  market value steeply age-discounted after 30.
- `development.ts` — asymptotic growth toward the hidden ceiling, gated hard by minutes, with
  attribute-specific decline and per-position, per-seed peak ages.

## Counts are overdispersed, not Poisson

`overdispersed(rng, mean, varianceRatio)` is a gamma-Poisson mixture parameterised by variance
as a multiple of the mean. Poisson is too tight — every season on the table looks the same —
but a fixed dispersion parameter overdoes it badly at high means, which is how you get
sixty-goal seasons.

## Tuning targets

Run `npm run sim -- --seeds 10000 --report summary` for current numbers. The bands come from
the phase 2 brief; the harness prints each one with ok/OFF.
