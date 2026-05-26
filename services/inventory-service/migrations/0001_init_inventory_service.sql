SELECT pg_advisory_lock(77001601);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE inventory_reservation_status AS ENUM ('ACTIVE', 'RELEASED', 'CONFIRMED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE inventory_movement_type AS ENUM ('ADJUST', 'RESERVE', 'RELEASE', 'CONFIRM', 'EXPIRE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE role AS ENUM ('BUYER', 'CUSTOMER', 'SELLER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'WAREHOUSE', 'SUPER_ADMIN', 'SERVICE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TYPE role ADD VALUE IF NOT EXISTS 'BUYER';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'MODERATOR';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'SERVICE';

DO $$
BEGIN
  CREATE TYPE outbox_status AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku varchar(64) NOT NULL UNIQUE,
  product_id varchar(128) NOT NULL,
  seller_id uuid NOT NULL,
  on_hand integer NOT NULL,
  reserved integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_inventory_items_on_hand_non_negative CHECK (on_hand >= 0),
  CONSTRAINT chk_inventory_items_reserved_non_negative CHECK (reserved >= 0),
  CONSTRAINT chk_inventory_items_available_non_negative CHECK ((on_hand - reserved) >= 0)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_items'
      AND column_name = 'product_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE inventory_items
      ALTER COLUMN product_id TYPE varchar(128) USING product_id::text;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_inventory_items_product_id ON inventory_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_seller_id ON inventory_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_updated_at ON inventory_items(updated_at);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  sku varchar(64) NOT NULL REFERENCES inventory_items(sku) ON UPDATE CASCADE ON DELETE RESTRICT,
  quantity integer NOT NULL,
  status inventory_reservation_status NOT NULL,
  expires_at timestamptz NOT NULL,
  request_id varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_inventory_reservations_quantity_positive CHECK (quantity > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_reservations_active_order_sku
  ON inventory_reservations(order_id, sku)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_order_id ON inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_status_expires_at ON inventory_reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_sku ON inventory_reservations(sku);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku varchar(64) NOT NULL REFERENCES inventory_items(sku) ON UPDATE CASCADE ON DELETE RESTRICT,
  order_id uuid,
  movement_type inventory_movement_type NOT NULL,
  delta_on_hand integer NOT NULL,
  delta_reserved integer NOT NULL,
  reason varchar(500),
  actor_id uuid NOT NULL,
  actor_role role NOT NULL,
  request_id varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_sku ON inventory_movements(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order_id ON inventory_movements(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON inventory_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);

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
  consumer_name varchar(128) NOT NULL DEFAULT 'inventory-service',
  event_id varchar(128) NOT NULL,
  event_type varchar(128) NOT NULL,
  topic varchar(128) NOT NULL,
  partition integer NOT NULL,
  offset_value bigint NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE processed_events ADD COLUMN IF NOT EXISTS consumer_name varchar(128) NOT NULL DEFAULT 'inventory-service';
ALTER TABLE processed_events DROP CONSTRAINT IF EXISTS processed_events_event_id_key;
ALTER TABLE processed_events DROP CONSTRAINT IF EXISTS processed_events_topic_partition_offset_value_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_processed_events_consumer_event_id ON processed_events(consumer_name, event_id);
DROP INDEX IF EXISTS ux_processed_events_consumer_offset;
CREATE INDEX IF NOT EXISTS idx_processed_events_type ON processed_events(event_type);
CREATE INDEX IF NOT EXISTS idx_processed_events_processed_at ON processed_events(processed_at);

SELECT pg_advisory_unlock(77001601);
