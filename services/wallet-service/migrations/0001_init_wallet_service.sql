SELECT pg_advisory_lock(77002601);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  currency char(3) NOT NULL,
  is_frozen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_wallets_seller_currency UNIQUE (seller_id, currency),
  CONSTRAINT chk_wallets_currency_upper CHECK (currency = upper(currency))
);

CREATE INDEX IF NOT EXISTS idx_wallets_seller_id ON wallets(seller_id);

CREATE TABLE IF NOT EXISTS ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES wallets(id) ON DELETE RESTRICT,
  account_type varchar(32) NOT NULL,
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ledger_accounts_type CHECK (
    account_type IN ('PLATFORM_CLEARING', 'PLATFORM_PAYOUT_CLEARING', 'SELLER_HELD', 'SELLER_AVAILABLE', 'PAYOUT_PENDING')
  ),
  CONSTRAINT chk_ledger_accounts_scope CHECK (
    (account_type IN ('PLATFORM_CLEARING', 'PLATFORM_PAYOUT_CLEARING') AND wallet_id IS NULL)
    OR (account_type NOT IN ('PLATFORM_CLEARING', 'PLATFORM_PAYOUT_CLEARING') AND wallet_id IS NOT NULL)
  ),
  CONSTRAINT chk_ledger_accounts_currency_upper CHECK (currency = upper(currency))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_accounts_seller_scope
  ON ledger_accounts(wallet_id, account_type, currency)
  WHERE wallet_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_accounts_platform_scope
  ON ledger_accounts(account_type, currency)
  WHERE wallet_id IS NULL;

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type varchar(32) NOT NULL,
  reference_type varchar(32) NOT NULL,
  reference_id varchar(128) NOT NULL,
  idempotency_key varchar(255) NOT NULL UNIQUE,
  currency char(3) NOT NULL,
  description varchar(500),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ledger_transactions_type CHECK (
    transaction_type IN ('PAYMENT_HELD', 'FUNDS_RELEASED', 'PAYMENT_REFUND', 'CHARGEBACK', 'PAYOUT_REQUESTED', 'PAYOUT_SUCCEEDED', 'PAYOUT_FAILED', 'PAYOUT_CANCELLED')
  ),
  CONSTRAINT chk_ledger_transactions_currency_upper CHECK (currency = upper(currency))
);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_reference
  ON ledger_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_created_at
  ON ledger_transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES ledger_transactions(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ledger_entries_non_zero CHECK (amount_minor <> 0),
  CONSTRAINT ux_ledger_entries_transaction_account UNIQUE (transaction_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);

CREATE OR REPLACE FUNCTION assert_balanced_ledger_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_transaction_id uuid;
  entry_total numeric;
BEGIN
  target_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  IF NOT EXISTS (SELECT 1 FROM ledger_transactions WHERE id = target_transaction_id) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount_minor), 0)
    INTO entry_total
    FROM ledger_entries
   WHERE transaction_id = target_transaction_id;

  IF entry_total <> 0 THEN
    RAISE EXCEPTION 'unbalanced ledger transaction %, total %', target_transaction_id, entry_total;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_entries_balanced ON ledger_entries;
CREATE CONSTRAINT TRIGGER trg_ledger_entries_balanced
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_balanced_ledger_transaction();

CREATE TABLE IF NOT EXISTS order_delivery_signals (
  order_id uuid PRIMARY KEY,
  seller_id uuid NOT NULL,
  delivered_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fund_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL UNIQUE,
  order_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  currency char(3) NOT NULL,
  captured_amount_minor bigint NOT NULL,
  refunded_amount_minor bigint NOT NULL DEFAULT 0,
  released_amount_minor bigint NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'HELD',
  delivered_at timestamptz,
  release_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_fund_holds_captured_positive CHECK (captured_amount_minor > 0),
  CONSTRAINT chk_fund_holds_refunded_range CHECK (
    refunded_amount_minor >= 0 AND refunded_amount_minor <= captured_amount_minor
  ),
  CONSTRAINT chk_fund_holds_released_range CHECK (
    released_amount_minor >= 0 AND released_amount_minor <= captured_amount_minor
  ),
  CONSTRAINT chk_fund_holds_status CHECK (
    status IN ('HELD', 'PARTIALLY_REFUNDED', 'REFUNDED', 'RELEASED')
  )
);

CREATE INDEX IF NOT EXISTS idx_fund_holds_order_id ON fund_holds(order_id);
CREATE INDEX IF NOT EXISTS idx_fund_holds_seller_id ON fund_holds(seller_id);
CREATE INDEX IF NOT EXISTS idx_fund_holds_release_due
  ON fund_holds(release_at)
  WHERE release_at IS NOT NULL AND status IN ('HELD', 'PARTIALLY_REFUNDED');

CREATE TABLE IF NOT EXISTS pending_payment_reversals (
  payment_id uuid PRIMARY KEY,
  order_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  currency char(3) NOT NULL,
  cumulative_amount_minor bigint NOT NULL,
  is_chargeback boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pending_payment_reversals_positive CHECK (cumulative_amount_minor > 0)
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  bank_code varchar(32) NOT NULL,
  account_holder_name varchar(255) NOT NULL,
  encrypted_account_number bytea NOT NULL,
  encryption_nonce bytea NOT NULL,
  account_number_last4 varchar(4) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'UNVERIFIED',
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_bank_accounts_status CHECK (status IN ('UNVERIFIED', 'ALLOWLISTED', 'DISABLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_bank_accounts_one_default
  ON bank_accounts(wallet_id)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'REQUESTED',
  provider varchar(64),
  provider_reference varchar(128),
  transfer_code varchar(32),
  failure_code varchar(128),
  failure_message varchar(500),
  bank_code varchar(32) NOT NULL,
  account_holder_name varchar(255) NOT NULL,
  encrypted_account_number bytea NOT NULL,
  encryption_nonce bytea NOT NULL,
  account_number_last4 varchar(4) NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  last_reconciled_at timestamptz,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_payouts_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT chk_payouts_status CHECK (status IN ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_payouts_wallet_id ON payouts(wallet_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_dispatch
  ON payouts(status, next_attempt_at, requested_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_payouts_provider_reference
  ON payouts(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE TABLE IF NOT EXISTS sepay_payout_webhook_events (
  transaction_id varchar(128) PRIMARY KEY,
  payout_id uuid REFERENCES payouts(id) ON DELETE RESTRICT,
  gateway varchar(64),
  source_account_number varchar(128) NOT NULL,
  transfer_amount_minor bigint NOT NULL,
  transfer_content text,
  reference_code varchar(128),
  transaction_at timestamptz,
  process_status varchar(32) NOT NULL,
  failure_reason varchar(500),
  raw_payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT chk_sepay_payout_webhook_amount CHECK (transfer_amount_minor > 0),
  CONSTRAINT chk_sepay_payout_webhook_status CHECK (
    process_status IN ('RECEIVED', 'MATCHED', 'UNMATCHED', 'REVIEW_REQUIRED', 'ALREADY_COMPLETED')
  )
);

CREATE INDEX IF NOT EXISTS idx_sepay_payout_webhook_payout
  ON sepay_payout_webhook_events(payout_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_sepay_payout_webhook_status
  ON sepay_payout_webhook_events(process_status, received_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  idempotency_key varchar(255) NOT NULL,
  request_hash varchar(128) NOT NULL,
  resource_type varchar(64) NOT NULL,
  resource_id uuid,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_idempotency_records_actor_key UNIQUE (actor_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS processed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_name varchar(128) NOT NULL,
  event_id varchar(255) NOT NULL,
  event_type varchar(128) NOT NULL,
  topic varchar(128) NOT NULL,
  partition integer NOT NULL,
  offset_value bigint NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_processed_events_consumer_event UNIQUE (consumer_name, event_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_events_type ON processed_events(event_type);
CREATE INDEX IF NOT EXISTS idx_processed_events_processed_at ON processed_events(processed_at);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type varchar(64) NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING',
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CONSTRAINT chk_outbox_events_status CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED', 'DEAD'))
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_dispatch
  ON outbox_events(status, next_retry_at, created_at);

-- Phase 2 upgrade path for databases that already ran the Phase 1 version.
ALTER TABLE ledger_accounts DROP CONSTRAINT IF EXISTS chk_ledger_accounts_type;
ALTER TABLE ledger_accounts ADD CONSTRAINT chk_ledger_accounts_type CHECK (
  account_type IN ('PLATFORM_CLEARING', 'PLATFORM_PAYOUT_CLEARING', 'SELLER_HELD', 'SELLER_AVAILABLE', 'PAYOUT_PENDING')
);
ALTER TABLE ledger_accounts DROP CONSTRAINT IF EXISTS chk_ledger_accounts_scope;
ALTER TABLE ledger_accounts ADD CONSTRAINT chk_ledger_accounts_scope CHECK (
  (account_type IN ('PLATFORM_CLEARING', 'PLATFORM_PAYOUT_CLEARING') AND wallet_id IS NULL)
  OR (account_type NOT IN ('PLATFORM_CLEARING', 'PLATFORM_PAYOUT_CLEARING') AND wallet_id IS NOT NULL)
);
ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS chk_ledger_transactions_type;
ALTER TABLE ledger_transactions ADD CONSTRAINT chk_ledger_transactions_type CHECK (
  transaction_type IN ('PAYMENT_HELD', 'FUNDS_RELEASED', 'PAYMENT_REFUND', 'CHARGEBACK', 'PAYOUT_REQUESTED', 'PAYOUT_SUCCEEDED', 'PAYOUT_FAILED', 'PAYOUT_CANCELLED')
);

ALTER TABLE outbox_events DROP CONSTRAINT IF EXISTS chk_outbox_events_status;
ALTER TABLE outbox_events ADD CONSTRAINT chk_outbox_events_status CHECK (
  status IN ('PENDING', 'PUBLISHED', 'FAILED', 'DEAD')
);

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS bank_code varchar(32);
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS account_holder_name varchar(255);
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS encrypted_account_number bytea;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS encryption_nonce bytea;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS account_number_last4 varchar(4);
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS transfer_code varchar(32);
UPDATE payouts p
SET bank_code = COALESCE(p.bank_code, b.bank_code),
    account_holder_name = COALESCE(p.account_holder_name, b.account_holder_name),
    encrypted_account_number = COALESCE(p.encrypted_account_number, b.encrypted_account_number),
    encryption_nonce = COALESCE(p.encryption_nonce, b.encryption_nonce),
    account_number_last4 = COALESCE(p.account_number_last4, b.account_number_last4)
FROM bank_accounts b
WHERE b.id = p.bank_account_id
  AND (p.bank_code IS NULL OR p.account_holder_name IS NULL OR p.encrypted_account_number IS NULL OR p.encryption_nonce IS NULL OR p.account_number_last4 IS NULL);
ALTER TABLE payouts ALTER COLUMN bank_code SET NOT NULL;
ALTER TABLE payouts ALTER COLUMN account_holder_name SET NOT NULL;
ALTER TABLE payouts ALTER COLUMN encrypted_account_number SET NOT NULL;
ALTER TABLE payouts ALTER COLUMN encryption_nonce SET NOT NULL;
ALTER TABLE payouts ALTER COLUMN account_number_last4 SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payouts_dispatch ON payouts(status, next_attempt_at, requested_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_payouts_provider_reference ON payouts(provider, provider_reference) WHERE provider_reference IS NOT NULL;
UPDATE payouts
SET transfer_code = 'EMALL' || upper(substr(replace(id::text, '-', ''), 1, 12))
WHERE transfer_code IS NULL AND provider = 'manual_vietqr';
CREATE UNIQUE INDEX IF NOT EXISTS ux_payouts_transfer_code ON payouts(transfer_code) WHERE transfer_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS wallet_admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_email varchar(320) NOT NULL,
  action varchar(64) NOT NULL,
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  previous_status varchar(64),
  new_status varchar(64),
  reason varchar(500) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_admin_audit_wallet_created
  ON wallet_admin_audit_logs(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_admin_audit_actor_created
  ON wallet_admin_audit_logs(actor_id, created_at DESC);

-- Customer refund wallets. The historical seller_id column stores the wallet owner id;
-- owner_type keeps seller revenue and customer refunds strictly separated.
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS owner_type varchar(16) NOT NULL DEFAULT 'SELLER';
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS ux_wallets_seller_currency;
DROP INDEX IF EXISTS ux_wallets_seller_currency;
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS chk_wallets_owner_type;
ALTER TABLE wallets ADD CONSTRAINT chk_wallets_owner_type CHECK (owner_type IN ('SELLER', 'CUSTOMER'));
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallets_owner_currency
  ON wallets(owner_type, seller_id, currency);
CREATE INDEX IF NOT EXISTS idx_wallets_owner ON wallets(owner_type, seller_id);

ALTER TABLE ledger_accounts DROP CONSTRAINT IF EXISTS chk_ledger_accounts_type;
ALTER TABLE ledger_accounts ADD CONSTRAINT chk_ledger_accounts_type CHECK (
  account_type IN ('PLATFORM_CLEARING', 'PLATFORM_PAYOUT_CLEARING', 'SELLER_HELD', 'SELLER_AVAILABLE', 'CUSTOMER_AVAILABLE', 'PAYOUT_PENDING')
);
ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS chk_ledger_transactions_type;
ALTER TABLE ledger_transactions ADD CONSTRAINT chk_ledger_transactions_type CHECK (
  transaction_type IN ('PAYMENT_HELD', 'FUNDS_RELEASED', 'PAYMENT_REFUND', 'CUSTOMER_REFUND_CREDIT', 'CHARGEBACK', 'PAYOUT_REQUESTED', 'PAYOUT_SUCCEEDED', 'PAYOUT_FAILED', 'PAYOUT_CANCELLED')
);

ALTER TABLE pending_payment_reversals ADD COLUMN IF NOT EXISTS customer_id uuid;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS payout_type varchar(32) NOT NULL DEFAULT 'SELLER_WITHDRAWAL';
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS chk_payouts_type;
ALTER TABLE payouts ADD CONSTRAINT chk_payouts_type CHECK (
  payout_type IN ('SELLER_WITHDRAWAL', 'CUSTOMER_REFUND')
);

SELECT pg_advisory_unlock(77002601);
