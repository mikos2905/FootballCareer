import { useState } from 'react';
import {
  CADENCE_OPTIONS,
  FOOT_OPTIONS,
  NATION_OPTIONS,
  POSITION_OPTIONS,
  resolveSeed,
  useGame,
} from '../../state';
import type { Cadence, Foot, PositionId } from '../../engine/types';
import { Action, BottomBar, ChoiceRow, Field, Select, TextInput } from '../components/Shell';

/** Tap a spot to pick a position. Labelled buttons, not an image map. */
function Pitch({ value, onChange }: { value: PositionId; onChange: (id: PositionId) => void }): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Position"
      className="relative h-[400px] w-full rounded border border-slate-400 bg-green-200"
    >
      <div className="absolute inset-x-0 top-1/2 border-t border-green-400" />
      <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-green-400" />
      {POSITION_OPTIONS.map((position) => {
        const selected = position.id === value;
        return (
          <button
            key={position.id}
            type="button"
            aria-pressed={selected}
            aria-label={position.name}
            onClick={() => onChange(position.id)}
            style={{ left: `${position.x}%`, bottom: `${position.y}%` }}
            className={`absolute min-h-[44px] min-w-[44px] -translate-x-1/2 translate-y-1/2 rounded border px-1 text-xs font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-500 ${
              selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-500 bg-white text-slate-900'
            }`}
          >
            {position.short}
          </button>
        );
      })}
    </div>
  );
}

export function Creation(): JSX.Element {
  const { dispatch } = useGame();
  const [surname, setSurname] = useState('');
  const [shirt, setShirt] = useState('9');
  const [foot, setFoot] = useState<Foot>('right');
  const [nationId, setNationId] = useState('eng');
  const [position, setPosition] = useState<PositionId>('ST');
  const [seed, setSeed] = useState('');
  const [cadence, setCadence] = useState<Cadence>('standard');
  const [mode, setMode] = useState<'draft' | 'quick'>('draft');

  const start = () => {
    const resolved = resolveSeed(seed);
    const shirtNumber = Math.min(99, Math.max(1, Number(shirt) || 9));
    dispatch({
      type: 'start',
      mode,
      config: {
        seed: resolved.seed,
        seedLabel: resolved.label,
        cadence,
        surname: surname.trim() || 'Rivas',
        shirtNumber,
        foot,
        nationId,
        position,
      },
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
    >
      <h1 className="text-2xl font-bold">Football Career</h1>
      <p className="mt-1 text-sm text-slate-600">
        You are sixteen. Everything after this is decided by what you choose and how it falls.
      </p>

      <div className="mt-5 space-y-4">
        <ChoiceRow
          label="How to start"
          value={mode}
          onChange={setMode}
          options={[
            { id: 'draft', name: 'Draft your ceiling', detail: 'Build your potential, eight picks' },
            { id: 'quick', name: 'Quick start', detail: 'Straight into a career' },
          ]}
        />

        <Field label="Surname">
          <TextInput
            value={surname}
            onChange={(e) => setSurname(e.target.value)}
            placeholder="Rivas"
            maxLength={18}
            autoComplete="off"
          />
        </Field>

        <div className="flex gap-3">
          <div className="w-24">
            <Field label="Shirt">
              <TextInput
                value={shirt}
                onChange={(e) => setShirt(e.target.value.replace(/\D/g, '').slice(0, 2))}
                inputMode="numeric"
                aria-label="Shirt number, 1 to 99"
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Foot">
              <ChoiceRow label="Preferred foot" value={foot} onChange={setFoot} options={FOOT_OPTIONS} />
            </Field>
          </div>
        </div>

        <Field label="Nationality" hint="Decides which leagues come looking first">
          <Select value={nationId} onChange={(e) => setNationId(e.target.value)}>
            {NATION_OPTIONS.map((nation) => (
              <option key={nation.id} value={nation.id}>
                {nation.name}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <span className="block text-sm font-semibold">Position</span>
          <span className="block text-xs text-slate-600">
            Tap the pitch. Currently {POSITION_OPTIONS.find((p) => p.id === position)?.name}.
          </span>
          <div className="mt-1">
            <Pitch value={position} onChange={setPosition} />
          </div>
        </div>

        <Field label="Decision cadence">
          <ChoiceRow
            label="Decision cadence"
            value={cadence}
            onChange={setCadence}
            options={CADENCE_OPTIONS.map((c) => ({ id: c.id, name: c.name, detail: c.detail }))}
          />
        </Field>

        <Field label="Seed" hint="Leave it blank for a random career. Share it to share the career.">
          <TextInput
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="random"
            autoComplete="off"
          />
        </Field>
      </div>

      <BottomBar>
        <Action type="submit">
          <span className="block text-center font-semibold">
            {mode === 'draft' ? 'Start drafting' : 'Start career'}
          </span>
        </Action>
      </BottomBar>
    </form>
  );
}
