import { useGame, type PromptContext } from '../../state';
import { Action } from '../components/Shell';

function money(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  return `€${Math.round(value / 1000)}k`;
}

/**
 * Everything needed to answer, on the screen where the answering happens.
 * Nobody should have to remember a number from a screen ago.
 */
function StateStrip({ context }: { context: PromptContext }): JSX.Element {
  const contract =
    context.contractYearsRemaining <= 0
      ? 'Out of contract'
      : `${context.contractYearsRemaining} ${context.contractYearsRemaining === 1 ? 'year' : 'years'} left`;
  const rows: [string, string][] = [
    ['Age', String(context.age)],
    ['Overall', String(context.ovr)],
    ['Club', context.clubName],
    ['League', context.leagueName],
    ['Role', context.squadRole],
    ['Standing', `${context.standing}/99`],
    ['Contract', contract],
    ['Wage', `${money(context.wage)}/yr`],
  ];
  return (
    <dl className="rounded border border-slate-400 bg-white px-3 py-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 border-b border-slate-200 py-1 last:border-0">
          <dt className="text-slate-600">{label}</dt>
          <dd className="text-right font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Decision(): JSX.Element {
  const { prompt, dispatch } = useGame();
  if (!prompt) return <p>Nothing to decide.</p>;

  const answer = (optionIndex: number, optionId: string) => {
    if (prompt.kind === 'card') {
      dispatch({ type: 'decide', cardId: prompt.cardId, optionId, optionIndex });
    } else {
      dispatch({ type: 'chooseOffer', optionIndex });
    }
  };

  return (
    <div>
      <p className="text-sm text-slate-600">
        {prompt.context.year} · age {prompt.context.age}
      </p>
      <h1 className="text-xl font-bold">{prompt.title}</h1>
      <p className="mt-2 text-base leading-relaxed">{prompt.situation}</p>

      <div className="mt-4">
        <StateStrip context={prompt.context} />
      </div>

      <h2 className="mt-5 text-sm font-semibold">What do you do?</h2>
      <ul className="mt-2 space-y-2 pb-4">
        {prompt.options.map((option, index) => (
          <li key={option.id}>
            <Action variant="secondary" onClick={() => answer(index, option.id)}>
              <span className="block font-semibold">{option.label}</span>
              <span className="mt-0.5 block text-sm text-slate-600">{option.detail}</span>
            </Action>
          </li>
        ))}
      </ul>
    </div>
  );
}
