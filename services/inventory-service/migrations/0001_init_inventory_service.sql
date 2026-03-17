CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE inventory_reservation_status AS ENUM ('ACTIVE', 'RELEASED', 'CONFIRMED', 'EXPIRED');
CREATE TYPE inventory_movement_type AS ENUM ('ADJUST', 'RESERVE', 'RELEASE', 'CONFIRM', 'EXPIRE');
CREATE TYPE role AS ENUM ('BUYER', 'CUSTOMER', 'SELLER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'WAREHOUSE', 'SUPER_ADMIN', 'SERVICE');
CREATE TYPE outbox_status AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku varchar(64) NOT NULL UNIQUE,
  product_id uuid NOT NULL,
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

CREATE INDEX idx_inventory_items_product_id ON inventory_items(product_id);
CREATE INDEX idx_inventory_items_seller_id ON inventory_items(seller_id);
CREATE INDEX idx_inventory_items_updated_at ON inventory_items(updated_at);

CREATE TABLE inventory_reservations (
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

CREATE UNIQUE INDEX ux_inventory_reservations_active_order_sku
  ON inventory_reservations(order_id, sku)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_inventory_reservations_order_id ON inventory_reservations(order_id);
CREATE INDEX idx_inventory_reservations_status_expires_at ON inventory_reservations(status, expires_at);
CREATE INDEX idx_inventory_reservations_sku ON inventory_reservations(sku);

CREATE TABLE inventory_movements (
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

CREATE INDEX idx_inventory_movements_sku ON inventory_movements(sku);
CREATE INDEX idx_inventory_movements_order_id ON inventory_movements(order_id);
CREATE INDEX idx_inventory_movements_created_at ON inventory_movements(created_at);
CREATE INDEX idx_inventory_movements_type ON inventory_movements(movement_type);

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
