CREATE TYPE user_role_enum AS ENUM (
  'buyer',
  'seller',
  'admin'
);

CREATE TYPE user_status_enum AS ENUM (
  'active',
  'pending',
  'suspended',
  'deleted'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(30),
  role user_role_enum NOT NULL DEFAULT 'buyer',
  status user_status_enum NOT NULL DEFAULT 'pending',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email_unique ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);
