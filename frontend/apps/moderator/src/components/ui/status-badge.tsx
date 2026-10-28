import type { ModerationProductStatus } from '@/lib/api/types';

interface StatusBadgeProps {
  status: ModerationProductStatus | string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const normalized = status.toUpperCase();

  const config: Record<
    string,
    { label: string; dot: string; bg: string; text: string; border: string }
  > = {
    ACTIVE: {
      label: 'Đang hoạt động',
      dot: 'bg-emerald-500',
      bg: 'bg-emerald-50/80',
      text: 'text-emerald-700',
      border: 'border-emerald-200'
    },
    DRAFT: {
      label: 'Bản nháp',
      dot: 'bg-slate-400',
      bg: 'bg-slate-50',
      text: 'text-slate-600',
      border: 'border-slate-200'
    },
    HIDDEN: {
      label: 'Đã ẩn',
      dot: 'bg-amber-500',
      bg: 'bg-amber-50/80',
      text: 'text-amber-800',
      border: 'border-amber-200'
    },
    ARCHIVED: {
      label: 'Đã lưu trữ',
      dot: 'bg-rose-500',
      bg: 'bg-rose-50/80',
      text: 'text-rose-700',
      border: 'border-rose-200'
    },
    // Wallet / Payout statuses
    FROZEN: {
      label: 'Đóng băng',
      dot: 'bg-rose-500',
      bg: 'bg-rose-50/80',
      text: 'text-rose-700',
      border: 'border-rose-200'
    },
    ALLOWLISTED: {
      label: 'Đã xác minh',
      dot: 'bg-emerald-500',
      bg: 'bg-emerald-50/80',
      text: 'text-emerald-700',
      border: 'border-emerald-200'
    },
    UNVERIFIED: {
      label: 'Chờ xác minh',
      dot: 'bg-amber-500',
      bg: 'bg-amber-50/80',
      text: 'text-amber-800',
      border: 'border-amber-200'
    },
    DISABLED: {
      label: 'Đã khóa',
      dot: 'bg-slate-500',
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-300'
    },
    MISSING: {
      label: 'Chưa thiết lập',
      dot: 'bg-slate-400',
      bg: 'bg-slate-50',
      text: 'text-slate-500',
      border: 'border-slate-200'
    },
    REQUESTED: {
      label: 'Đã yêu cầu',
      dot: 'bg-amber-500',
      bg: 'bg-amber-50/80',
      text: 'text-amber-800',
      border: 'border-amber-200'
    },
    PROCESSING: {
      label: 'Đang xử lý',
      dot: 'bg-sky-500',
      bg: 'bg-sky-50/80',
      text: 'text-sky-800',
      border: 'border-sky-200'
    },
    SUCCEEDED: {
      label: 'Thành công',
      dot: 'bg-emerald-500',
      bg: 'bg-emerald-50/80',
      text: 'text-emerald-700',
      border: 'border-emerald-200'
    },
    FAILED: {
      label: 'Thất bại',
      dot: 'bg-rose-500',
      bg: 'bg-rose-50/80',
      text: 'text-rose-700',
      border: 'border-rose-200'
    },
    CANCELLED: {
      label: 'Đã hủy',
      dot: 'bg-slate-400',
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      border: 'border-slate-200'
    }
  };

  const current = config[normalized] || {
    label: status,
    dot: 'bg-slate-400',
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200'
  };

  const sizeClasses =
    size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-tight shadow-2xs ${current.bg} ${current.text} ${current.border} ${sizeClasses}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${current.dot}`} />
      <span>{current.label}</span>
    </span>
  );
}
