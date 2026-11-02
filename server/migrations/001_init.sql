-- PostgreSQL schema for TripPilot (Phase 2 subset).
-- The runtime JsonStore mirrors these tables; a pg-backed Store is the production target.
CREATE TABLE users (
  id               uuid PRIMARY KEY,
  email            text NOT NULL UNIQUE,
  name             text NOT NULL,
  password_hash    text NOT NULL,
  role             text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  email_verified_at timestamptz,
  verify_token     text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nationality       text NOT NULL DEFAULT '',
  residence_country text NOT NULL DEFAULT '',
  home_airport      text NOT NULL DEFAULT '',
  interests         text[] NOT NULL DEFAULT '{}',
  onboarded_at      timestamptz
);

CREATE TABLE trips (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination text NOT NULL,
  depart_on   date NOT NULL,
  return_on   date NOT NULL CHECK (return_on >= depart_on),
  purpose     text NOT NULL,
  budget      numeric(12,2),
  status      text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','ready','completed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trips_user_idx ON trips (user_id, depart_on);
