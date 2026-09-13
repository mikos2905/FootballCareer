import {
  ARCHETYPE_OPTIONS,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_ORDER,
  remainingDraftAttributes,
  useGame,
} from '../../state';
import type { AttributeKey } from '../../engine/types';
import { Action } from '../components/Shell';

/**
 * Eight archetypes, one at a time. Take one attribute from each; each attribute
 * can only be taken once, so the eighth is forced — which the screen says
 * outright rather than pretending it is a choice.
 */
export function Draft(): JSX.Element {
  const { state, dispatch } = useGame();
  const draft = state.draft;
  if (!draft) return <p>Nothing to draft.</p>;

  const step = draft.picks.length;
  const archetypeId = draft.order[step];
  const archetype = ARCHETYPE_OPTIONS.find((a) => a.id === archetypeId);
  if (!archetype) return <p>Nothing to draft.</p>;

  const remaining = remainingDraftAttributes(draft);
  const forced = remaining.length === 1;
  const takenBy = new Map(draft.picks.map((p) => [p.attribute, p.archetypeId]));

  return (
    <div>
      <p className="text-sm text-slate-600">
        Pick {step + 1} of {ARCHETYPE_OPTIONS.length}
      </p>
      <h1 className="text-2xl font-bold">{archetype.name}</h1>
      <p className="mt-1 text-sm">{archetype.blurb}</p>

      <p className="mt-4 text-sm font-semibold">
        {forced
          ? 'One attribute left, so this one is decided for you.'
          : 'Take one attribute from him. You cannot take it again later.'}
      </p>

      <ul className="mt-2 space-y-2">
        {remaining.map((key) => (
          <li key={key}>
            <Action variant="secondary" onClick={() => dispatch({ type: 'draftPick', attribute: key })}>
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{ATTRIBUTE_LABELS[key]}</span>
                <span className="tabular-nums text-lg font-bold">{archetype.offers[key]}</span>
              </span>
            </Action>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 text-sm font-semibold">Your ceiling so far</h2>
      <table className="mt-1 w-full text-sm">
        <caption className="sr-only">The ceiling being assembled, attribute by attribute</caption>
        <tbody>
          {ATTRIBUTE_ORDER.map((key) => {
            const from = takenBy.get(key as AttributeKey);
            const source = from ? ARCHETYPE_OPTIONS.find((a) => a.id === from) : null;
            const value = source ? source.offers[key as AttributeKey] : null;
            return (
              <tr key={key} className="border-b border-slate-300">
                <th scope="row" className="py-1 text-left font-normal">
                  {ATTRIBUTE_LABELS[key as AttributeKey]}
                </th>
                <td className="py-1 text-right tabular-nums font-semibold">{value ?? '—'}</td>
                <td className="py-1 pl-3 text-right text-xs text-slate-600">{source ? source.name : 'not taken'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-600">
        This is your potential, not where you start. Whether you get near it depends on how much you play.
      </p>
    </div>
  );
}
