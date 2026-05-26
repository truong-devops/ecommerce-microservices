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
CREATE UNIQUE INDEX IF NOT EXISTS ux_processed_events_consumer_offset ON processed_events(consumer_name, topic, partition, offset_value);
CREATE INDEX IF NOT EXISTS idx_processed_events_type ON processed_events(event_type);
CREATE INDEX IF NOT EXISTS idx_processed_events_processed_at ON processed_events(processed_at);

SELECT pg_advisory_unlock(77001601);
