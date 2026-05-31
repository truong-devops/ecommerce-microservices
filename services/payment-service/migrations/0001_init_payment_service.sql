SELECT pg_advisory_lock(77001601);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM (
      'PENDING',
      'REQUIRES_ACTION',
      'AUTHORIZED',
      'CAPTURED',
      'FAILED',
      'CANCELLED',
      'PARTIALLY_REFUNDED',
      'REFUNDED',
      'CHARGEBACK'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_status') THEN
    CREATE TYPE refund_status AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_transaction_type') THEN
    CREATE TYPE payment_transaction_type AS ENUM (
      'INTENT_CREATED',
      'REQUIRES_ACTION',
      'AUTHORIZED',
      'CAPTURED',
      'FAILED',
      'CANCELLED',
      'REFUND_REQUESTED',
      'REFUND_SUCCEEDED',
      'REFUND_FAILED',
      'CHARGEBACK',
      'WEBHOOK_RECEIVED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role') THEN
    CREATE TYPE role AS ENUM ('BUYER', 'CUSTOMER', 'SELLER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'WAREHOUSE', 'SUPER_ADMIN', 'SERVICE');
  END IF;
END $$;

ALTER TYPE role ADD VALUE IF NOT EXISTS 'BUYER';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'MODERATOR';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'SERVICE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbox_status') THEN
    CREATE TYPE outbox_status AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  seller_id uuid,
  provider varchar(64) NOT NULL,
  provider_payment_id varchar(128) UNIQUE,
  status payment_status NOT NULL,
  currency char(3) NOT NULL,
  amount numeric(14, 2) NOT NULL,
  refunded_amount numeric(14, 2) NOT NULL DEFAULT 0,
  description varchar(500),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_seller_id ON payments(seller_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS captured_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_payments_expires_at ON payments(expires_at);
CREATE INDEX IF NOT EXISTS idx_payments_provider_status_expires_at ON payments(provider, status, expires_at);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  transaction_type payment_transaction_type NOT NULL,
  gateway_transaction_id varchar(128) UNIQUE,
  amount numeric(14, 2) NOT NULL,
  currency char(3) NOT NULL,
  status varchar(64) NOT NULL,
  request_id varchar(64) NOT NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment_id ON payment_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at);

CREATE TABLE IF NOT EXISTS payment_status_histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  from_status payment_status,
  to_status payment_status NOT NULL,
  changed_by uuid NOT NULL,
  changed_by_role role NOT NULL,
  reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_status_histories_payment_id ON payment_status_histories(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_status_histories_created_at ON payment_status_histories(created_at);

CREATE TABLE IF NOT EXISTS payment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  action varchar(64) NOT NULL,
  actor_id uuid NOT NULL,
  actor_role role NOT NULL,
  request_id varchar(64) NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_payment_id ON payment_audit_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_created_at ON payment_audit_logs(created_at);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_hash varchar(64) NOT NULL,
  payment_id uuid,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_records_expires_at ON idempotency_records(expires_at);

CREATE TABLE IF NOT EXISTS webhook_idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(64) NOT NULL,
  provider_event_id varchar(128) NOT NULL,
  request_hash varchar(64) NOT NULL,
  payment_id uuid,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_records_expires_at ON webhook_idempotency_records(expires_at);

CREATE TABLE IF NOT EXISTS payment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(64) NOT NULL,
  provider_event_id varchar(128) NOT NULL,
  gateway_transaction_id varchar(128),
  provider_payment_id varchar(128),
  payment_id uuid,
  event_type varchar(128) NOT NULL,
  process_status varchar(32) NOT NULL DEFAULT 'RECEIVED',
  failure_code varchar(128),
  failure_reason varchar(500),
  raw_payload jsonb NOT NULL,
  raw_body text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_provider_events_payment_id ON payment_provider_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_provider_events_status ON payment_provider_events(process_status);
CREATE INDEX IF NOT EXISTS idx_payment_provider_events_provider_payment_id ON payment_provider_events(provider, provider_payment_id);

CREATE TABLE IF NOT EXISTS payment_reconciliation_cursors (
  provider varchar(64) PRIMARY KEY,
  since_id varchar(128),
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  provider_refund_id varchar(128) UNIQUE,
  amount numeric(14, 2) NOT NULL,
  currency char(3) NOT NULL,
  status refund_status NOT NULL,
  reason varchar(500),
  metadata jsonb,
  requested_by uuid NOT NULL,
  requested_by_role role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON refunds(created_at);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type varchar(64) NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  status outbox_status NOT NULL DEFAULT 'PENDING',
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status ON outbox_events(status);
CREATE INDEX IF NOT EXISTS idx_outbox_events_created_at ON outbox_events(created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_events_next_retry_at ON outbox_events(next_retry_at);

CREATE TABLE IF NOT EXISTS processed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_name varchar(128) NOT NULL DEFAULT 'payment-service',
  event_id varchar(128) NOT NULL,
  event_type varchar(128) NOT NULL,
  topic varchar(128) NOT NULL,
  partition integer NOT NULL,
  offset_value bigint NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE processed_events ADD COLUMN IF NOT EXISTS consumer_name varchar(128) NOT NULL DEFAULT 'payment-service';
ALTER TABLE processed_events DROP CONSTRAINT IF EXISTS processed_events_event_id_key;
ALTER TABLE processed_events DROP CONSTRAINT IF EXISTS processed_events_topic_partition_offset_value_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_processed_events_consumer_event_id ON processed_events(consumer_name, event_id);
DROP INDEX IF EXISTS ux_processed_events_consumer_offset;
CREATE INDEX IF NOT EXISTS idx_processed_events_type ON processed_events(event_type);
CREATE INDEX IF NOT EXISTS idx_processed_events_processed_at ON processed_events(processed_at);

SELECT pg_advisory_unlock(77001601);
