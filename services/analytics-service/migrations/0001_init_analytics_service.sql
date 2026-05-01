CREATE TABLE IF NOT EXISTS analytics_events_raw (
  event_key TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  source_service TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  seller_id TEXT NULL,
  user_id TEXT NULL,
  order_id TEXT NULL,
  payment_id TEXT NULL,
  shipment_id TEXT NULL,
  amount NUMERIC(18, 2) NULL,
  refunded_amount NUMERIC(18, 2) NULL,
  currency TEXT NULL,
  status TEXT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seller_daily_metrics (
  bucket_date DATE NOT NULL,
  seller_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  total_events BIGINT NOT NULL DEFAULT 0,
  total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_refunded_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_date, seller_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_raw_occurred_at ON analytics_events_raw (occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_raw_seller_id ON analytics_events_raw (seller_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_raw_event_type ON analytics_events_raw (event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_raw_order_id ON analytics_events_raw (order_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_raw_payment_id ON analytics_events_raw (payment_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_raw_shipment_id ON analytics_events_raw (shipment_id);
