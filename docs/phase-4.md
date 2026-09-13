# Phase 4 — minimal playable UI

Deliberately ugly. Tailwind defaults, system fonts, no custom colour, no animation. The point
is to find flow problems while screens are still cheap to throw away.

## Boundaries

- **Components render state and dispatch actions.** Nothing in `src/ui` computes an OVR,
  decides an outcome or reads a tunable. ESLint blocks value imports from `src/engine` and
  `src/data` inside `src/ui` (type imports are allowed so components can name what they
  render), and a test greps for the same thing plus `<div onClick>`.
- **`src/state` is the only place the UI and the engine meet.** It exposes a reducer, a
  context, and a catalogue that reshapes engine data into UI shapes.
- **No router.** One page, a derived screen: `creation → draft → season → decision → end`.
  The screen is derived rather than stored, because exactly one screen is consistent with a
  given career state and a stored one can disagree with the game.

## How the UI drives the engine

The engine's career loop answers decisions through a synchronous callback, which a UI cannot
satisfy — React has to return to the event loop and wait for a tap.

So `src/state/driver.ts` replays the career from its seed every time an answer is added,
supplying the answers so far from a list and capturing the first unanswered prompt. A full
career replays in a couple of milliseconds, and the model is exactly what the phase 6 share URL
needs: **a career is a seed plus a list of answers, and nothing else.**

Transfer windows come through the same decision screen as cards. The brief's screen list did
not include a transfer screen, but routing them to a policy would have taken back the agency
phase 3 gave the player.

## Taps for a full career

Quick start, counted from a blank creation screen to the ending:

| Cadence | Card decisions | Transfer windows | Season taps | Creation | Total |
| --- | --- | --- | --- | --- | --- |
| Full | 17.8 | 5.5 | 16.9 | 7 | **47** |
| Standard | 16.0 | 5.6 | 17.0 | 7 | **46** |
| Express | 10.8 | 5.3 | 16.8 | 7 | **40** |

Drafting a ceiling adds 8. All comfortably under sixty.

## Accessibility floor

Semantic buttons throughout, `aria-pressed` on toggles, visible focus rings, 44px minimum tap
targets (checked in a browser, not by eye). The OVR change carries a sign and a screen-reader
sentence, so a drop reads as a drop without colour.
