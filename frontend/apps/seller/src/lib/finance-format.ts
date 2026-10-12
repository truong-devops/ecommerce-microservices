import type { SellerBankAccountStatus, SellerPayoutStatus, SellerWalletTransactionType } from './api/types';

export function formatVnd(value: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function transactionLabel(type: SellerWalletTransactionType): string {
  const labels: Record<SellerWalletTransactionType, string> = {
    PAYMENT_HELD: 'Doanh thu đang giữ',
    FUNDS_RELEASED: 'Doanh thu khả dụng',
    PAYMENT_REFUND: 'Hoàn tiền đơn hàng',
    CHARGEBACK: 'Truy thu thanh toán',
    PAYOUT_REQUESTED: 'Yêu cầu rút tiền',
    PAYOUT_SUCCEEDED: 'Rút tiền thành công',
    PAYOUT_FAILED: 'Hoàn lại tiền rút'
  };
  return labels[type] ?? type;
}

export function transactionDescription(type: SellerWalletTransactionType): string {
  const descriptions: Record<SellerWalletTransactionType, string> = {
    PAYMENT_HELD: 'Tiền đơn hàng đã được ghi nhận và tạm giữ.',
    FUNDS_RELEASED: 'Tiền đã đủ điều kiện chuyển sang số dư có thể rút.',
    PAYMENT_REFUND: 'Khoản hoàn tiền đã được khấu trừ khỏi ví.',
    CHARGEBACK: 'Khoản thanh toán đã bị truy thu.',
    PAYOUT_REQUESTED: 'Tiền đã được giữ cho yêu cầu rút.',
    PAYOUT_SUCCEEDED: 'Tiền đã được chuyển thành công.',
    PAYOUT_FAILED: 'Yêu cầu thất bại và tiền đã được hoàn về số dư.'
  };
  return descriptions[type] ?? '';
}

export function payoutStatus(status: SellerPayoutStatus): { label: string; className: string } {
  const values: Record<SellerPayoutStatus, { label: string; className: string }> = {
    REQUESTED: { label: 'Đã tiếp nhận', className: 'border-amber-200 bg-amber-50 text-amber-700' },
    PROCESSING: { label: 'Đang chuyển', className: 'border-sky-200 bg-sky-50 text-sky-700' },
    SUCCEEDED: { label: 'Thành công', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    FAILED: { label: 'Thất bại', className: 'border-rose-200 bg-rose-50 text-rose-700' },
    CANCELLED: { label: 'Đã hủy', className: 'border-slate-200 bg-slate-50 text-slate-600' }
  };
  return values[status];
}

export function bankStatus(status: SellerBankAccountStatus): { label: string; className: string } {
  if (status === 'ALLOWLISTED') return { label: 'Đã xác minh', className: 'bg-emerald-100 text-emerald-700' };
  if (status === 'DISABLED') return { label: 'Đã vô hiệu hóa', className: 'bg-rose-100 text-rose-700' };
  return { label: 'Chưa xác minh', className: 'bg-amber-100 text-amber-700' };
}

export function bankDisplayName(code: string): string {
  const names: Record<string, string> = {
    VCB: 'Vietcombank',
    TCB: 'Techcombank',
    MB: 'MB Bank',
    ACB: 'ACB',
    BIDV: 'BIDV',
    VTB: 'VietinBank',
    VPB: 'VPBank',
    TPB: 'TPBank',
    STB: 'Sacombank',
    VIB: 'VIB',
    MSB: 'MSB',
    OCB: 'OCB',
    SHB: 'SHB'
  };
  return names[code] ?? code;
}
