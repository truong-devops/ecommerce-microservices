CREATE DATABASE IF NOT EXISTS ecommerce_analytics;

CREATE TABLE IF NOT EXISTS ecommerce_analytics.analytics_events_raw (
  event_key String,
  event_type LowCardinality(String),
  source_service LowCardinality(Nullable(String)),
  occurred_at DateTime64(3, 'UTC'),
  seller_id Nullable(String),
  user_id Nullable(String),
  order_id Nullable(String),
  payment_id Nullable(String),
  shipment_id Nullable(String),
  amount Nullable(Decimal(18, 2)),
  refunded_amount Nullable(Decimal(18, 2)),
  currency LowCardinality(Nullable(String)),
  status LowCardinality(Nullable(String)),
  payload_json String,
  created_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (event_type, occurred_at, event_key)
TTL toDateTime(occurred_at) + INTERVAL 365 DAY
SETTINGS index_granularity = 8192;

ALTER TABLE ecommerce_analytics.analytics_events_raw
  ADD INDEX IF NOT EXISTS idx_seller_id seller_id TYPE bloom_filter(0.01) GRANULARITY 64;

ALTER TABLE ecommerce_analytics.analytics_events_raw
  ADD INDEX IF NOT EXISTS idx_order_id order_id TYPE bloom_filter(0.01) GRANULARITY 64;

ALTER TABLE ecommerce_analytics.analytics_events_raw
  ADD INDEX IF NOT EXISTS idx_payment_id payment_id TYPE bloom_filter(0.01) GRANULARITY 64;

ALTER TABLE ecommerce_analytics.analytics_events_raw
  ADD INDEX IF NOT EXISTS idx_shipment_id shipment_id TYPE bloom_filter(0.01) GRANULARITY 64;
