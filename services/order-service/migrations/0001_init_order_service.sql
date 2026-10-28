SELECT pg_advisory_lock(77001601);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'FAILED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role') THEN
    CREATE TYPE role AS ENUM ('BUYER', 'CUSTOMER', 'SELLER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'WAREHOUSE', 'SUPER_ADMIN', 'SERVICE');
  END IF;
END
$$;

ALTER TYPE role ADD VALUE IF NOT EXISTS 'BUYER';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'MODERATOR';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'SERVICE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbox_status') THEN
    CREATE TYPE outbox_status AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number varchar(32) NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  status order_status NOT NULL,
  currency char(3) NOT NULL,
  subtotal_amount numeric(14, 2) NOT NULL,
  shipping_amount numeric(14, 2) NOT NULL,
  discount_amount numeric(14, 2) NOT NULL,
  total_amount numeric(14, 2) NOT NULL,
  note varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE SEQUENCE IF NOT EXISTS order_number_seq AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;

DO $$
DECLARE
  max_display_code bigint;
  sequence_last_value bigint;
  sequence_is_called boolean;
  next_sequence_value bigint;
BEGIN
  SELECT COALESCE(MAX(RIGHT(digits, 7)::bigint), 0)
  INTO max_display_code
  FROM (
    SELECT REGEXP_REPLACE(UPPER(order_number), '[^0-9]', '', 'g') AS digits
    FROM orders
  ) normalized
  WHERE digits <> '';

  SELECT last_value, is_called
  INTO sequence_last_value, sequence_is_called
  FROM order_number_seq;

  next_sequence_value := GREATEST(
    max_display_code + 1,
    CASE WHEN sequence_is_called THEN sequence_last_value + 1 ELSE sequence_last_value END,
    1
  );

  IF next_sequence_value > 9999999 THEN
    RAISE EXCEPTION 'order display code space exhausted';
  END IF;

  PERFORM setval('order_number_seq', next_sequence_value, false);
END
$$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_name varchar(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_phone varchar(32);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_address varchar(500);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_ward varchar(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_district varchar(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_province varchar(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method varchar(32);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id varchar(128) NOT NULL,
  sku varchar(64) NOT NULL,
  product_name_snapshot varchar(255) NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(14, 2) NOT NULL,
  total_price numeric(14, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_status_histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status,
  to_status order_status NOT NULL,
  changed_by uuid NOT NULL,
  changed_by_role role NOT NULL,
  reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_histories_order_id ON order_status_histories(order_id);

CREATE TABLE IF NOT EXISTS order_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  action varchar(64) NOT NULL,
  actor_id uuid NOT NULL,
  actor_role role NOT NULL,
  request_id varchar(64) NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_audit_logs_order_id ON order_audit_logs(order_id);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_hash varchar(64) NOT NULL,
  order_id uuid,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_records_expires_at ON idempotency_records(expires_at);

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

CREATE TABLE IF NOT EXISTS order_saga_states (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  saga_status varchar(32) NOT NULL DEFAULT 'PENDING',
  inventory_status varchar(32) NOT NULL DEFAULT 'PENDING',
  payment_status varchar(32) NOT NULL DEFAULT 'PENDING',
  inventory_event_id varchar(128),
  payment_event_id varchar(128),
  failure_code varchar(128),
  failure_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_saga_states_saga_status ON order_saga_states(saga_status);
CREATE INDEX IF NOT EXISTS idx_order_saga_states_updated_at ON order_saga_states(updated_at);

CREATE TABLE IF NOT EXISTS processed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_name varchar(128) NOT NULL DEFAULT 'order-service',
  event_id varchar(128) NOT NULL,
  event_type varchar(128) NOT NULL,
  topic varchar(128) NOT NULL,
  partition integer NOT NULL,
  offset_value bigint NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE processed_events ADD COLUMN IF NOT EXISTS consumer_name varchar(128) NOT NULL DEFAULT 'order-service';
ALTER TABLE processed_events DROP CONSTRAINT IF EXISTS processed_events_event_id_key;
ALTER TABLE processed_events DROP CONSTRAINT IF EXISTS processed_events_topic_partition_offset_value_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_processed_events_consumer_event_id ON processed_events(consumer_name, event_id);
DROP INDEX IF EXISTS ux_processed_events_consumer_offset;
CREATE INDEX IF NOT EXISTS idx_processed_events_type ON processed_events(event_type);
CREATE INDEX IF NOT EXISTS idx_processed_events_processed_at ON processed_events(processed_at);

CREATE TABLE IF NOT EXISTS return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number varchar(32) NOT NULL UNIQUE,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  status varchar(32) NOT NULL CHECK (status IN ('REQUESTED', 'APPROVED', 'RETURNING', 'REJECTED', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED')),
  reason_code varchar(64) NOT NULL,
  reason_detail varchar(1000) NOT NULL,
  evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  seller_note varchar(1000),
  refund_amount numeric(14, 2) NOT NULL CHECK (refund_amount > 0),
  currency char(3) NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz,
  refunded_at timestamptz,
  return_shipment_id uuid,
  return_awb varchar(64),
  return_tracking_number varchar(64),
  return_tracking_url varchar(1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS received_at timestamptz;
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS return_shipment_id uuid;
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS return_awb varchar(64);
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS return_tracking_number varchar(64);
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS return_tracking_url varchar(1000);
ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS return_requests_status_check;
ALTER TABLE return_requests ADD CONSTRAINT return_requests_status_check
  CHECK (status IN ('REQUESTED', 'APPROVED', 'RETURNING', 'REJECTED', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED'));

CREATE INDEX IF NOT EXISTS idx_return_requests_customer_id ON return_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_seller_id ON return_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_status ON return_requests(status);
CREATE INDEX IF NOT EXISTS idx_return_requests_requested_at ON return_requests(requested_at DESC);

SELECT pg_advisory_unlock(77001601);
