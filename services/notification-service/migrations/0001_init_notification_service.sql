CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE notification_channel AS ENUM ('EMAIL', 'SMS', 'PUSH', 'IN_APP');
CREATE TYPE notification_category AS ENUM ('AUTH', 'ORDER', 'SHIPPING', 'CAMPAIGN', 'SYSTEM');

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  channel notification_channel NOT NULL,
  category notification_category NOT NULL,
  event_type varchar(128),
  subject varchar(255),
  content text NOT NULL,
  payload jsonb,
  status notification_status NOT NULL DEFAULT 'PENDING',
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_event_type ON notifications(event_type);
CREATE INDEX idx_notifications_next_retry_at ON notifications(next_retry_at);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

CREATE TABLE notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  provider varchar(64) NOT NULL,
  status varchar(32) NOT NULL,
  response_message varchar(500),
  error_code varchar(64),
  metadata jsonb,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_attempts_notification_id ON notification_attempts(notification_id);
CREATE INDEX idx_notification_attempts_attempted_at ON notification_attempts(attempted_at);

CREATE TABLE inbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key varchar(128) NOT NULL UNIQUE,
  event_type varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbox_events_event_type ON inbox_events(event_type);
CREATE INDEX idx_inbox_events_consumed_at ON inbox_events(consumed_at);
