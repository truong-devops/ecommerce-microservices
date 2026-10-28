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
  onClick,
  active = false
}: StatCardProps) {
  const clickableClasses = onClick
    ? 'cursor-pointer transition duration-150 hover:border-[#ee4d2d]'
    : '';

  return (
    <article
      onClick={onClick}
      className={`relative overflow-hidden rounded-lg border p-4 shadow-xs transition ${
        active
          ? 'border-[#ee4d2d] bg-[#fef6f5] ring-1 ring-[#ee4d2d]'
          : 'border-[#e8e8e8] bg-white'
      } ${clickableClasses}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#757575]">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[#222222]">
            {value}
          </p>
          {hint && (
            <p className="mt-1 text-xs text-[#757575] truncate">
              {hint}
            </p>
          )}
        </div>

        {icon && (
          <div
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
              active
                ? 'bg-[#ee4d2d] text-white'
                : 'bg-[#f5f5f5] text-[#555555]'
            }`}
          >
            {icon}
          </div>
        )}
      </div>
    </article>
  );
}
