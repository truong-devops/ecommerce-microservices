CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE TYPE refund_status AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
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
CREATE TYPE role AS ENUM ('CUSTOMER', 'ADMIN', 'SUPPORT', 'WAREHOUSE', 'SELLER', 'SUPER_ADMIN');
CREATE TYPE outbox_status AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

CREATE TABLE payments (
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

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_seller_id ON payments(seller_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_provider ON payments(provider);
CREATE INDEX idx_payments_created_at ON payments(created_at);

CREATE TABLE payment_transactions (
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

CREATE INDEX idx_payment_transactions_payment_id ON payment_transactions(payment_id);
CREATE INDEX idx_payment_transactions_created_at ON payment_transactions(created_at);

CREATE TABLE payment_status_histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  from_status payment_status,
  to_status payment_status NOT NULL,
  changed_by uuid NOT NULL,
  changed_by_role role NOT NULL,
  reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_status_histories_payment_id ON payment_status_histories(payment_id);
CREATE INDEX idx_payment_status_histories_created_at ON payment_status_histories(created_at);

CREATE TABLE payment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  action varchar(64) NOT NULL,
  actor_id uuid NOT NULL,
  actor_role role NOT NULL,
  request_id varchar(64) NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_audit_logs_payment_id ON payment_audit_logs(payment_id);
CREATE INDEX idx_payment_audit_logs_created_at ON payment_audit_logs(created_at);

CREATE TABLE idempotency_records (
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

CREATE INDEX idx_idempotency_records_expires_at ON idempotency_records(expires_at);

CREATE TABLE webhook_idempotency_records (
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

CREATE INDEX idx_webhook_idempotency_records_expires_at ON webhook_idempotency_records(expires_at);

CREATE TABLE refunds (
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

CREATE INDEX idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX idx_refunds_status ON refunds(status);
CREATE INDEX idx_refunds_created_at ON refunds(created_at);

CREATE TABLE outbox_events (
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

CREATE INDEX idx_outbox_events_status ON outbox_events(status);
CREATE INDEX idx_outbox_events_created_at ON outbox_events(created_at);
CREATE INDEX idx_outbox_events_next_retry_at ON outbox_events(next_retry_at);
