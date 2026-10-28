import type { ModerationProductStatus } from '@/lib/api/types';

interface StatusBadgeProps {
  status: ModerationProductStatus | string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const normalized = status.toUpperCase();

  const config: Record<
    string,
    { label: string; bg: string; text: string; border: string }
  > = {
    ACTIVE: {
      label: 'Đang hoạt động',
      bg: 'bg-[#fef6f5]',
      text: 'text-[#ee4d2d]',
      border: 'border-[#fcdcd7]'
    },
    DRAFT: {
      label: 'Bản nháp',
      bg: 'bg-[#f5f5f5]',
      text: 'text-[#666666]',
      border: 'border-[#e8e8e8]'
    },
    HIDDEN: {
      label: 'Đã ẩn',
      bg: 'bg-[#f5f5f5]',
      text: 'text-[#444444]',
      border: 'border-[#d4d4d4]'
    },
    ARCHIVED: {
      label: 'Đã lưu trữ',
      bg: 'bg-[#fafafa]',
      text: 'text-[#888888]',
      border: 'border-[#e8e8e8]'
    },
    // Wallet / Payout statuses
    FROZEN: {
      label: 'Đóng băng',
      bg: 'bg-[#f5f5f5]',
      text: 'text-[#222222]',
      border: 'border-[#999999]'
    },
    ALLOWLISTED: {
      label: 'Đã xác minh',
      bg: 'bg-[#fef6f5]',
      text: 'text-[#ee4d2d]',
      border: 'border-[#fcdcd7]'
    },
    UNVERIFIED: {
      label: 'Chờ xác minh',
      bg: 'bg-[#f5f5f5]',
      text: 'text-[#666666]',
      border: 'border-[#e8e8e8]'
    },
    DISABLED: {
      label: 'Đã khóa',
      bg: 'bg-[#f5f5f5]',
      text: 'text-[#444444]',
      border: 'border-[#cccccc]'
    },
    MISSING: {
      label: 'Chưa thiết lập',
      bg: 'bg-[#fafafa]',
      text: 'text-[#888888]',
      border: 'border-[#e8e8e8]'
    },
    REQUESTED: {
      label: 'Đã yêu cầu',
      bg: 'bg-[#fef6f5]',
      text: 'text-[#ee4d2d]',
      border: 'border-[#fcdcd7]'
    },
    PROCESSING: {
      label: 'Đang xử lý',
      bg: 'bg-[#f5f5f5]',
      text: 'text-[#333333]',
      border: 'border-[#cccccc]'
    },
    SUCCEEDED: {
      label: 'Thành công',
      bg: 'bg-[#fef6f5]',
      text: 'text-[#ee4d2d]',
      border: 'border-[#fcdcd7]'
    },
    FAILED: {
      label: 'Thất bại',
      bg: 'bg-[#f5f5f5]',
      text: 'text-[#222222]',
      border: 'border-[#888888]'
    },
    CANCELLED: {
      label: 'Đã hủy',
      bg: 'bg-[#fafafa]',
      text: 'text-[#888888]',
      border: 'border-[#e8e8e8]'
    }
  };

  const current = config[normalized] || {
    label: status,
    bg: 'bg-[#f5f5f5]',
    text: 'text-[#555555]',
    border: 'border-[#e8e8e8]'
  };

  const sizeClasses =
    size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center rounded border font-medium ${current.bg} ${current.text} ${current.border} ${sizeClasses}`}
    >
      <span>{current.label}</span>
    </span>
  );
}
