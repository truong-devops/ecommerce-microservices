import type { Shipment, ShipmentStatus } from '@frontend/buyer-contracts';

export function shipmentDisplayCode(shipment: Pick<Shipment, 'provider' | 'trackingNumber' | 'awb'> | null | undefined): string {
  const code = shipment?.trackingNumber?.trim() || shipment?.awb?.trim() || '';
  if (!code) {
    return '';
  }

  const provider = shipment?.provider?.trim();
  return provider ? `${provider} - ${code}` : code;
}

export function shipmentStatusLabel(status: ShipmentStatus | null | undefined): string {
  return {
    PENDING: 'Chờ xử lý',
    AWB_CREATED: 'Đã tạo vận đơn',
    PICKED_UP: 'Đã lấy hàng',
    IN_TRANSIT: 'Đang trung chuyển',
    OUT_FOR_DELIVERY: 'Đang giao',
    DELIVERED: 'Đã giao',
    CANCELLED: 'Đã hủy',
    FAILED: 'Thất bại',
    RETURNED: 'Đã hoàn'
  }[status ?? 'PENDING'];
}
