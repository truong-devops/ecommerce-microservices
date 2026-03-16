import { Role } from '../../../common/constants/role.enum';
import { ShipmentStatus } from '../entities/shipment-status.enum';

export interface ShipmentEventMetadata {
  requestId: string;
  occurredAt: string;
  actorId: string;
  actorRole: Role;
}

export interface ShipmentEventPayload {
  [key: string]: unknown;
  shipmentId: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  provider: string;
  status: ShipmentStatus;
  awb: string | null;
  trackingNumber: string | null;
  shippingFee: number;
  codAmount: number;
  currency: string;
  metadata: ShipmentEventMetadata;
}
