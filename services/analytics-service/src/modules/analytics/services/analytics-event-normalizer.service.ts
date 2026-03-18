import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { AnalyticsEventRecord } from '../entities/analytics-event-record.type';

interface EventEnvelope {
  eventType?: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

interface NormalizeResult {
  record: AnalyticsEventRecord | null;
  reason?: string;
}

@Injectable()
export class AnalyticsEventNormalizerService {
  normalize(messageKey: string | null, messageValue: string): NormalizeResult {
    let parsed: unknown;

    try {
      parsed = JSON.parse(messageValue);
    } catch {
      return {
        record: null,
        reason: 'invalid-json'
      };
    }

    if (!parsed || typeof parsed !== 'object') {
      return {
        record: null,
        reason: 'invalid-envelope'
      };
    }

    const envelope = parsed as EventEnvelope;
    const payload = (envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : parsed) as Record<string, unknown>;
    const eventType = this.extractEventType(envelope, messageKey);

    if (!eventType) {
      return {
        record: null,
        reason: 'missing-event-type'
      };
    }

    const occurredAt = this.extractOccurredAt(envelope, payload);
    const eventKey = this.buildEventKey(eventType, payload, occurredAt);

    const normalized: AnalyticsEventRecord = {
      eventKey,
      eventType,
      sourceService: this.extractSourceService(eventType),
      occurredAt,
      sellerId: this.toNullableString(payload.sellerId),
      userId: this.toNullableString(payload.userId) ?? this.toNullableString(payload.buyerId),
      orderId: this.toNullableString(payload.orderId),
      paymentId: this.toNullableString(payload.paymentId),
      shipmentId: this.toNullableString(payload.shipmentId),
      amount: this.toNullableNumber(payload.amount),
      refundedAmount: this.toNullableNumber(payload.refundedAmount),
      currency: this.toNullableString(payload.currency),
      status: this.toNullableString(payload.status),
      payloadJson: JSON.stringify(payload),
      createdAt: new Date().toISOString()
    };

    if (normalized.refundedAmount === null && eventType === 'payment.refunded') {
      normalized.refundedAmount = normalized.amount;
    }

    return {
      record: normalized
    };
  }

  private extractEventType(envelope: EventEnvelope, messageKey: string | null): string {
    const fromEnvelope = this.toNullableString(envelope.eventType);
    if (fromEnvelope) {
      return fromEnvelope;
    }

    return this.toNullableString(messageKey) ?? '';
  }

  private extractOccurredAt(envelope: EventEnvelope, payload: Record<string, unknown>): string {
    const payloadMetadata = payload.metadata;
    const metadataOccurredAt =
      payloadMetadata && typeof payloadMetadata === 'object' ? this.toNullableString((payloadMetadata as Record<string, unknown>).occurredAt) : null;

    const candidate = this.toNullableString(envelope.occurredAt) ?? metadataOccurredAt;
    if (!candidate) {
      return new Date().toISOString();
    }

    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }

    return parsed.toISOString();
  }

  private extractSourceService(eventType: string): string | null {
    const [sourceService] = eventType.split('.');
    return sourceService?.trim() || null;
  }

  private buildEventKey(eventType: string, payload: Record<string, unknown>, occurredAt: string): string {
    const canonical = canonicalize({
      eventType,
      payload,
      occurredAt
    });

    return createHash('sha256').update(canonical).digest('hex');
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private toNullableNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${canonicalize(val)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}
