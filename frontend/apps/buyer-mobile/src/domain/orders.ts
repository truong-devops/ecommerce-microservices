import type { OrderStatus, PaymentStatus } from '@frontend/buyer-contracts';

export function buyerOrderStatusLabel(orderStatus: OrderStatus, paymentStatus?: PaymentStatus | null): string {
  if (orderStatus === 'FAILED' && !paymentStatus) {
    return 'Chờ xác nhận';
  }

  return {
    PENDING: 'Chờ xác nhận',
    CONFIRMED: 'Đã xác nhận',
    PROCESSING: 'Đang chuẩn bị',
    SHIPPED: 'Đang giao hàng',
    DELIVERED: 'Hoàn thành',
    CANCELLED: 'Đã hủy',
    FAILED: 'Đặt hàng thất bại',
  }[orderStatus];
}

export function buyerOrderListStatusLabel(orderStatus: OrderStatus): string {
  return orderStatus === 'FAILED' ? 'Chờ xác nhận' : buyerOrderStatusLabel(orderStatus);
}
