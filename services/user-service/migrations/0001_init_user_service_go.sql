CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE users_role_enum AS ENUM ('buyer', 'seller', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE users_status_enum AS ENUM ('active', 'pending', 'suspended', 'deleted');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(30),
  address VARCHAR(255),
  address_province VARCHAR(128),
  address_province_code VARCHAR(32),
  address_ward VARCHAR(128),
  address_ward_code VARCHAR(32),
  gender VARCHAR(20) NOT NULL DEFAULT 'unspecified',
  date_of_birth DATE,
  avatar_url VARCHAR(500),
  role users_role_enum NOT NULL DEFAULT 'buyer',
  status users_status_enum NOT NULL DEFAULT 'pending',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS address_province VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address_province_code VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address_ward VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address_ward_code VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_users_email_unique ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
