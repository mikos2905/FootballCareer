import { useGame } from '../../state';
import { Action } from '../components/Shell';
import { SeasonTable } from '../components/SeasonTable';

function money(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  return `€${Math.round(value / 1000)}k`;
}

/** A stub. Phase 6 builds the real end screen, the share card and the share URL. */
export function End(): JSX.Element {
  const { progress, dispatch, nameOfNation } = useGame();
  const career = progress.career;
  if (!career) return <p>The career is not over.</p>;

  const keeper = career.config.position === 'GK';
  const cabinet = new Map<string, number>();
  for (const trophy of career.trophies) {
    cabinet.set(trophy.competitionName, (cabinet.get(trophy.competitionName) ?? 0) + 1);
  }

  const totals: [string, string][] = [
    ['Appearances', String(career.totals.appearances)],
    [keeper ? 'Clean sheets' : 'Goals', keeper ? String(career.seasons.reduce((n, s) => n + (s.keeper?.cleanSheets ?? 0), 0)) : String(career.totals.goals)],
    ['Assists', String(career.totals.assists)],
    ['Caps', String(career.totals.caps)],
    ['Clubs', String(career.totals.clubsPlayedFor)],
    ['Peak overall', String(career.peakOvr)],
    ['Hidden ceiling', String(career.ending.ceilingOvr)],
    ['Peak value', money(career.peakMarketValue)],
    ['Earned', money(career.totals.earnings)],
  ];

  return (
    <div>
      <p className="text-sm text-slate-600">
        {career.config.surname} · {career.config.position} · {nameOfNation(career.player.nationId)}
      </p>
      <h1 className="mt-1 text-3xl font-bold">{career.ending.label}</h1>
      <p className="mt-2 text-base leading-relaxed">{career.ending.verdict}</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 rounded border border-slate-400 bg-white p-3 text-sm">
        {totals.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 border-b border-slate-200 py-0.5">
            <dt className="text-slate-600">{label}</dt>
            <dd className="text-right font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-5 text-sm font-semibold">Trophy cabinet</h2>
      {cabinet.size === 0 ? (
        <p className="text-sm text-slate-600">Empty.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {[...cabinet].map(([name, count]) => (
            <li key={name} className="rounded border border-slate-400 bg-white px-3 py-1">
              {name} {count > 1 ? `×${count}` : ''}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 rounded border-2 border-slate-900 bg-white p-3 text-sm">
        Seed <span className="font-mono text-base font-bold">{career.seedLabel}</span>
        <span className="block text-xs text-slate-600">
          Same seed and same answers, same career. Ended {career.endReason.replace('-', ' ')}, age{' '}
          {career.endAge}.
        </span>
      </p>

      <h2 className="mt-5 text-sm font-semibold">Season by season</h2>
      <div className="mt-1">
        <SeasonTable seasons={career.seasons} keeper={keeper} />
      </div>

      <div className="mt-6">
        <Action onClick={() => dispatch({ type: 'restart' })}>
          <span className="block text-center font-semibold">Start another career</span>
        </Action>
      </div>
    </div>
  );
}
