export interface ChatEventMetadata {
  requestId: string;
  occurredAt: string;
  actorId: string;
  actorRole: string;
}

export interface ChatConversationCreatedEvent {
  conversationId: string;
  buyerId: string;
  sellerId: string;
  context: {
    productId?: string;
    orderId?: string;
    shopId?: string;
  };
  metadata: ChatEventMetadata;
}

export interface ChatMessageCreatedEvent {
  conversationId: string;
  buyerId: string;
  sellerId: string;
  senderId: string;
  senderRole: string;
  recipientId: string;
  message: {
    id: string;
    seq: number;
    senderId: string;
    senderRole: string;
    kind: string;
    text: string;
    sentAt: string;
  };
  metadata: ChatEventMetadata;
}

export interface ChatMessageReadEvent {
  conversationId: string;
  buyerId: string;
  sellerId: string;
  readerId: string;
  readerRole: string;
  readAt: string;
  modifiedCount: number;
  metadata: ChatEventMetadata;
}
