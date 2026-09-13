import type { ReactNode } from 'react';

/**
 * The one layout. Phone portrait at 390px, and on a desktop the same column
 * centred — not a second layout.
 */
export function Shell({ children, hasBottomBar }: { children: ReactNode; hasBottomBar: boolean }): JSX.Element {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className={`mx-auto w-full max-w-[420px] px-4 pt-4 ${hasBottomBar ? 'pb-28' : 'pb-8'}`}>{children}</div>
    </div>
  );
}

/** A button that fills the thumb's reach. 44px minimum, always a real button. */
export function Action({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  type?: 'button' | 'submit';
}): JSX.Element {
  const base =
    'w-full min-h-[52px] rounded border px-4 py-3 text-left text-base focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400 disabled:opacity-50';
  const look =
    variant === 'primary'
      ? 'border-slate-900 bg-slate-900 text-white'
      : 'border-slate-400 bg-white text-slate-900';
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${look}`}>
      {children}
    </button>
  );
}

/** The bar pinned under the thumb. Never more than one primary action in it. */
export function BottomBar({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-slate-300 bg-slate-100">
      <div className="mx-auto w-full max-w-[420px] px-4 py-3">{children}</div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }): JSX.Element {
  return (
    <label className="block">
      <span className="block text-sm font-semibold">{label}</span>
      {hint ? <span className="block text-xs text-slate-600">{hint}</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

const INPUT =
  'w-full min-h-[48px] rounded border border-slate-400 bg-white px-3 py-2 text-base focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input {...props} className={INPUT} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return <select {...props} className={INPUT} />;
}

/**
 * A row of choices. Rendered as real buttons with aria-pressed, so the choice
 * is announced rather than only being a different shade of grey.
 */
export function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; name: string; detail?: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}): JSX.Element {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={`min-h-[48px] flex-1 rounded border px-3 py-2 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400 ${
              selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-400 bg-white'
            }`}
          >
            <span className="block font-semibold">
              {selected ? '✓ ' : ''}
              {option.name}
            </span>
            {option.detail ? <span className="block text-xs opacity-80">{option.detail}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
