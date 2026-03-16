CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE shipment_status AS ENUM (
  'PENDING',
  'AWB_CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
  'RETURNED'
);

CREATE TYPE role AS ENUM ('CUSTOMER', 'ADMIN', 'SUPPORT', 'WAREHOUSE', 'SELLER', 'SUPER_ADMIN');
CREATE TYPE outbox_status AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  provider varchar(64) NOT NULL,
  awb varchar(64) UNIQUE,
  tracking_number varchar(64),
  status shipment_status NOT NULL,
  currency char(3) NOT NULL,
  shipping_fee numeric(14, 2) NOT NULL,
  cod_amount numeric(14, 2) NOT NULL,
  recipient_name varchar(255) NOT NULL,
  recipient_phone varchar(32) NOT NULL,
  recipient_address varchar(500) NOT NULL,
  note varchar(500),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipments_order_id ON shipments(order_id);
CREATE INDEX idx_shipments_buyer_id ON shipments(buyer_id);
CREATE INDEX idx_shipments_seller_id ON shipments(seller_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_tracking_number ON shipments(tracking_number);
CREATE INDEX idx_shipments_awb ON shipments(awb);
CREATE INDEX idx_shipments_created_at ON shipments(created_at);

CREATE TABLE shipment_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status shipment_status NOT NULL,
  event_code varchar(64),
  description varchar(500),
  location varchar(255),
  occurred_at timestamptz NOT NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipment_tracking_events_shipment_id ON shipment_tracking_events(shipment_id);
CREATE INDEX idx_shipment_tracking_events_status ON shipment_tracking_events(status);
CREATE INDEX idx_shipment_tracking_events_occurred_at ON shipment_tracking_events(occurred_at);

CREATE TABLE shipment_status_histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  from_status shipment_status,
  to_status shipment_status NOT NULL,
  changed_by uuid NOT NULL,
  changed_by_role role NOT NULL,
  reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipment_status_histories_shipment_id ON shipment_status_histories(shipment_id);
CREATE INDEX idx_shipment_status_histories_created_at ON shipment_status_histories(created_at);

CREATE TABLE shipment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL,
  action varchar(64) NOT NULL,
  actor_id uuid NOT NULL,
  actor_role role NOT NULL,
  request_id varchar(64) NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipment_audit_logs_shipment_id ON shipment_audit_logs(shipment_id);
CREATE INDEX idx_shipment_audit_logs_created_at ON shipment_audit_logs(created_at);

CREATE TABLE webhook_idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(64) NOT NULL,
  provider_event_id varchar(128) NOT NULL,
  request_hash varchar(64) NOT NULL,
  shipment_id uuid,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX idx_webhook_idempotency_records_expires_at ON webhook_idempotency_records(expires_at);

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
