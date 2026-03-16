import { Role } from '../../../common/constants/role.enum';

export interface OrderEventMetadata {
  requestId: string;
  occurredAt: string;
  actorId: string;
  actorRole: Role;
}

export interface OrderEventPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  status: string;
  totalAmount: number;
  currency: string;
  metadata: OrderEventMetadata;
}
