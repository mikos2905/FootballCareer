import type { SeasonRecord } from '../../engine/types';

/** The running season table. Same shape on the season screen and the end screen. */
export function SeasonTable({ seasons, keeper }: { seasons: readonly SeasonRecord[]; keeper: boolean }): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">Season by season</caption>
        <thead>
          <tr className="border-b border-slate-400 text-left">
            <th scope="col" className="py-1 pr-2 font-semibold">Yr</th>
            <th scope="col" className="py-1 pr-2 font-semibold">Club</th>
            <th scope="col" className="py-1 pr-1 text-right font-semibold">Ap</th>
            <th scope="col" className="py-1 pr-1 text-right font-semibold">{keeper ? 'CS' : 'G'}</th>
            <th scope="col" className="py-1 pr-1 text-right font-semibold">{keeper ? 'Sv%' : 'A'}</th>
            <th scope="col" className="py-1 text-right font-semibold">OVR</th>
          </tr>
        </thead>
        <tbody>
          {seasons.map((season) => (
            <tr key={season.season} className="border-b border-slate-200 align-top">
              <td className="py-1 pr-2 tabular-nums">{season.year}</td>
              <td className="py-1 pr-2">
                {season.clubName}
                {season.onLoanFrom ? ' (loan)' : ''}
                {season.trophies.length > 0 ? (
                  <span className="block text-slate-600">{season.trophies.map((t) => t.competitionName).join(', ')}</span>
                ) : null}
              </td>
              <td className="py-1 pr-1 text-right tabular-nums">{season.appearances}</td>
              <td className="py-1 pr-1 text-right tabular-nums">
                {keeper ? (season.keeper?.cleanSheets ?? 0) : season.goals}
              </td>
              <td className="py-1 pr-1 text-right tabular-nums">
                {keeper
                  ? season.keeper && season.starts > 0
                    ? (season.keeper.savePercentage * 100).toFixed(0)
                    : '—'
                  : season.assists}
              </td>
              <td className="py-1 text-right tabular-nums font-semibold">{season.ovrEnd}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
