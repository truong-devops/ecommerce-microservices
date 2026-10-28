import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: 'default' | 'brand' | 'emerald' | 'amber' | 'rose' | 'indigo';
  onClick?: () => void;
  active?: boolean;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  onClick,
  active = false
}: StatCardProps) {
  const toneClasses = {
    default: {
      card: 'border-slate-200/80 bg-white hover:border-slate-300',
      iconBg: 'bg-slate-100 text-slate-700',
      valueText: 'text-slate-900',
      activeRing: 'ring-2 ring-slate-400'
    },
    brand: {
      card: 'border-brand-200/70 bg-gradient-to-b from-brand-50/50 to-white hover:border-brand-300',
      iconBg: 'bg-brand-100/80 text-brand-700',
      valueText: 'text-brand-900',
      activeRing: 'ring-2 ring-brand-500'
    },
    emerald: {
      card: 'border-emerald-200/70 bg-gradient-to-b from-emerald-50/40 to-white hover:border-emerald-300',
      iconBg: 'bg-emerald-100/80 text-emerald-700',
      valueText: 'text-emerald-950',
      activeRing: 'ring-2 ring-emerald-500'
    },
    amber: {
      card: 'border-amber-200/70 bg-gradient-to-b from-amber-50/40 to-white hover:border-amber-300',
      iconBg: 'bg-amber-100/80 text-amber-700',
      valueText: 'text-amber-950',
      activeRing: 'ring-2 ring-amber-500'
    },
    rose: {
      card: 'border-rose-200/70 bg-gradient-to-b from-rose-50/40 to-white hover:border-rose-300',
      iconBg: 'bg-rose-100/80 text-rose-700',
      valueText: 'text-rose-950',
      activeRing: 'ring-2 ring-rose-500'
    },
    indigo: {
      card: 'border-indigo-200/70 bg-gradient-to-b from-indigo-50/40 to-white hover:border-indigo-300',
      iconBg: 'bg-indigo-100/80 text-indigo-700',
      valueText: 'text-indigo-950',
      activeRing: 'ring-2 ring-indigo-500'
    }
  }[tone];

  const clickableClasses = onClick
    ? 'cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-hover active:translate-y-0'
    : '';

  return (
    <article
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-card ${toneClasses.card} ${clickableClasses} ${
        active ? toneClasses.activeRing : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className={`mt-2 text-2xl font-extrabold tracking-tight ${toneClasses.valueText}`}>
            {value}
          </p>
          {hint && (
            <p className="mt-1 text-xs font-medium text-slate-500 truncate">
              {hint}
            </p>
          )}
        </div>

        {icon && (
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toneClasses.iconBg}`}>
            {icon}
          </div>
        )}
      </div>
    </article>
  );
}
