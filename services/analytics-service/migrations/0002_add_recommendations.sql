CREATE TABLE IF NOT EXISTS recommendation_transactions (
  transaction_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NULL,
  seller_id TEXT NULL,
  product_ids TEXT[] NOT NULL,
  item_count INT NOT NULL,
  source_snapshot TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendation_transactions_order_id
  ON recommendation_transactions (order_id);

CREATE INDEX IF NOT EXISTS idx_recommendation_transactions_occurred_at
  ON recommendation_transactions (occurred_at);

CREATE INDEX IF NOT EXISTS idx_recommendation_transactions_seller_id
  ON recommendation_transactions (seller_id);

CREATE TABLE IF NOT EXISTS recommendation_rules (
  rule_id TEXT PRIMARY KEY,
  antecedent_product_ids TEXT[] NOT NULL,
  consequent_product_id TEXT NOT NULL,
  support_count BIGINT NOT NULL,
  antecedent_count BIGINT NOT NULL,
  consequent_count BIGINT NOT NULL,
  transaction_count BIGINT NOT NULL,
  support DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  lift DOUBLE PRECISION NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  seller_id TEXT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_rules_antecedent
  ON recommendation_rules USING GIN (antecedent_product_ids);

CREATE INDEX IF NOT EXISTS idx_recommendation_rules_consequent
  ON recommendation_rules (consequent_product_id);

CREATE INDEX IF NOT EXISTS idx_recommendation_rules_seller_score
  ON recommendation_rules (seller_id, score DESC);

CREATE TABLE IF NOT EXISTS recommendation_training_runs (
  run_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  window_days INT NOT NULL,
  min_support_count INT NOT NULL,
  min_confidence DOUBLE PRECISION NOT NULL,
  max_antecedent_size INT NOT NULL,
  transaction_count BIGINT NOT NULL DEFAULT 0,
  frequent_itemset_count BIGINT NOT NULL DEFAULT 0,
  rule_count BIGINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NULL,
  error_message TEXT NULL
);
