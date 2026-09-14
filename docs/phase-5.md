# Phase 5 — full card set and endings

## The set

Sixty-one cards. Counts below are cards *eligible* in a stage, not cards written
for one: a card that fits both prime and decline appears in both columns.

```
                         youth  breakthrough         prime       decline      twilight
--------------------------------------------------------------------------------------
contract                     2             1             1             1             2
transfer                     1             3             3             2             2
loan                         1             2            --            --            --
dressing-room                3             5             6             5             2
training                     2             3             3             3            --
injury                       1             2             4             3             2
lifestyle                    2             3             3             3             2
international                1             3             3             3             1
loyalty                      1             2             3             2             2
retirement                  --            --            --             2             2
```

`npm run sim -- --report coverage` prints this and fails loudly on a cell with
no card and no documented reason. The seven deliberately empty cells are listed
in `src/engine/decisions/coverage.ts` with the reason for each.

## Repetition

No card comes up twice in one career. Two cards are exempt and say why in
`tests/phase5.test.ts`:

- `seasonal-outlook`, the fallback, so a season with nothing eligible is not
  silent. With sixty-one cards it never fires in practice.
- `testimonial-or-one-more`, because the retirement beat comes due again every
  couple of seasons once the window opens and something has to answer it. The
  five twilight cards that also answer that beat are once per career.

Cards that answer a scripted beat turn up in most careers by design — phase 1
guarantees those beats fire whatever the seed does. Everything else sits at or
below about half of runs.

## Career Score

Four components, twenty-five points each, in `src/engine/scoring.ts`. Each is a
diminishing curve, so full marks needs an outstanding career rather than a long
one. The end screen shows all four with a bar and a sentence of detail, because
a total nobody can account for is a number, not a verdict.

- **Performance** — appearances and contributions, weighted by league strength.
- **Honours** — trophy prestige, plus international tournaments.
- **Peak** — 70% how high the rating got, 30% how much of the ceiling was used.
- **Standing** — 65% the best standing anywhere, 35% the share of the career
  spent there.

A maxed-standing one-club career and a trophy-laden mercenary career score
comparably: the three strategies' distributions overlap by 45–55%, with loyal
ahead of greedy by 3.9 points out of 100.

## Endings

Six tiers, matched on the shape of a career in priority order, not on score
bands. `pickTier` in `src/engine/endings.ts`:

| Tier | Matches |
|---|---|
| Statue | standing ≥ 92 at a club holding > 55% of the career, ≥ 8 seasons |
| Global Superstar | peak ≥ 86 and either 40 caps or 700 trophy weight |
| Serial Winner | 420 trophy weight, or 5 trophies, or an international tournament |
| What Might Have Been | ceiling ≥ 70, realised < 85%, and ≥ 9 points left on the table |
| Cult Hero | standing ≥ 58 at a club holding > 25% of the career |
| Journeyman | everything else |

What Might Have Been sits above the consolation tiers and below the
achievements, so a career that genuinely won things is not called wasted — but a
good score can still be told, accurately, that it was.

## Verdicts

A tier-specific opening, three fragments drawn from the career itself, and a
closing line that varies with how it ended. Fragments are shuffled on a
substream of the seed, so the same career always reads the same way and two
careers in the same tier do not read alike. The hidden ceiling is revealed here
and nowhere else.

## What the balance suite measures

`npm run sim -- --report cards` branches every card: it snapshots the states a
card comes up in, then plays each option forward from the same state with the
same seeds and compares.

Branch *n* of option A and branch *n* of option B start from the identical
cloned state with the identical derived seed, so they are matched pairs and
differencing them removes the state and the luck in one step. That is what makes
a once-per-career card measurable at all. The effect size is that difference
against the spread of outcomes *within* one sampled state — the luck the player
faces from that point on — rather than against the spread across all sampled
states, which would put the difference between a sixteen-year-old at a
provincial club and a twenty-six-year-old at a giant into the denominator.

Money axes are compared on a log scale and reported in euros: a handful of
superstar careers earn an order of magnitude above the median, and on the raw
scale their spread swamps every real difference.

Dominance is only asked about once a card moves something. The check is "better
on every axis" and the axes move together, so a card whose options are
indistinguishable reads as perfectly dominant — the same nothing the
fake-decision check already found. An option that ends the career is not a
comparator either: carrying on is not a dominant strategy just because it beats
stopping on every axis that counts upwards.
