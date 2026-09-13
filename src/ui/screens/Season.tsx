import { useGame } from '../../state';
import type { SeasonRecord } from '../../engine/types';
import { Action, BottomBar } from '../components/Shell';
import { SeasonTable } from '../components/SeasonTable';

function Stat({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div className="rounded border border-slate-300 bg-white px-2 py-2 text-center">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-slate-600">{label}</div>
    </div>
  );
}

/**
 * The screen the player sees most. The OVR change is what they look for first,
 * so it is the first thing on it, with a sign rather than only a colour — a
 * drop has to read as a drop in greyscale and out loud.
 */
export function Season(): JSX.Element {
  const { currentSeason, previousSeason, progress, state, dispatch } = useGame();
  const season = currentSeason as SeasonRecord | null;
  if (!season) return <p>No season to show.</p>;

  const keeper = season.keeper !== null;
  const change = season.ovrEnd - season.ovrStart;
  const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
  const changeWord = change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged';

  return (
    <div>
      <p className="text-sm text-slate-600">
        {season.year} · age {season.age}
      </p>
      <h1 className="text-xl font-bold">
        {season.clubName}
        {season.onLoanFrom ? ' (on loan)' : ''}
      </h1>
      <p className="text-sm text-slate-600">
        {season.leagueName} · finished {season.leaguePosition || '—'}
      </p>

      <div className="mt-4 rounded border-2 border-slate-900 bg-white p-4 text-center">
        <div className="text-sm font-semibold uppercase tracking-wide text-slate-600">Overall</div>
        <div className="text-5xl font-bold tabular-nums">{season.ovrEnd}</div>
        <div className="mt-1 text-base font-semibold tabular-nums">
          {sign}
          {Math.abs(change)} this season
        </div>
        <span className="sr-only">
          Overall rating {season.ovrEnd}, {changeWord} {Math.abs(change)} from {season.ovrStart}.
        </span>
      </div>

      {season.appearances === 0 ? (
        <p className="mt-4 rounded border border-slate-400 bg-white px-3 py-3 text-sm">
          No first-team football this season. You trained, you played for the reserves, and you got
          a little better anyway.
        </p>
      ) : (
      <div className="mt-4 grid grid-cols-4 gap-2">
        <Stat label="Apps" value={season.appearances} />
        {keeper ? (
          <>
            <Stat label="Clean sh." value={season.keeper?.cleanSheets ?? 0} />
            <Stat
              label="Save %"
              value={season.keeper && season.starts > 0 ? (season.keeper.savePercentage * 100).toFixed(0) : '—'}
            />
          </>
        ) : (
          <>
            <Stat label="Goals" value={season.goals} />
            <Stat label="Assists" value={season.assists} />
          </>
        )}
        <Stat label="Rating" value={season.averageRating > 0 ? season.averageRating.toFixed(1) : '—'} />
      </div>
      )}

      {season.trophies.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {season.trophies.map((trophy) => (
            <li key={trophy.competitionId} className="rounded border-2 border-slate-900 bg-white px-3 py-2 font-semibold">
              Won the {trophy.competitionName}
            </li>
          ))}
        </ul>
      ) : null}

      {season.caps > 0 ? (
        <p className="mt-3 text-sm">
          {season.caps} international {season.caps === 1 ? 'cap' : 'caps'}
          {season.internationalGoals > 0 ? `, ${season.internationalGoals} goals` : ''}.
        </p>
      ) : null}

      {season.injuries.filter((i) => i.matchesMissed >= 6).length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {season.injuries
            .filter((i) => i.matchesMissed >= 6)
            .map((injury, i) => (
              <li key={`${injury.label}-${i}`} className="rounded border border-slate-400 bg-white px-3 py-2">
                {injury.label} — missed {injury.matchesMissed} matches
              </li>
            ))}
        </ul>
      ) : null}

      {season.events.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {season.events.map((event, i) => (
            <li key={`${event}-${i}`} className="rounded border border-slate-400 bg-white px-3 py-2">
              {event}
            </li>
          ))}
        </ul>
      ) : null}

      {previousSeason && previousSeason.clubId !== season.clubId ? (
        <p className="mt-3 text-sm text-slate-600">First season at {season.clubName}.</p>
      ) : null}

      <h2 className="mt-6 text-sm font-semibold">Career so far</h2>
      <div className="mt-1">
        <SeasonTable seasons={progress.seasons.slice(0, state.viewedSeasons + 1)} keeper={keeper} />
      </div>

      <BottomBar>
        <Action onClick={() => dispatch({ type: 'advanceSeason' })}>
          <span className="block text-center font-semibold">Continue</span>
        </Action>
      </BottomBar>
    </div>
  );
}
