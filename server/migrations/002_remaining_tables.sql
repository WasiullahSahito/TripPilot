-- Remaining tables, integrity constraints, row-level security and the private storage bucket.
-- Run after 001_init.sql in the Supabase SQL editor (or `supabase db push`).

CREATE TABLE visa_applications (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination_id text NOT NULL,
  category_id    text NOT NULL,
  nationality    text NOT NULL DEFAULT '',
  residence      text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','submitted_on_portal')),
  checklist      jsonb NOT NULL DEFAULT '{}',
  data_enc       text NOT NULL,                       -- AES-256-GCM ciphertext; the key (DATA_KEY) stays on the server
  created_at     timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL,
  UNIQUE (user_id, destination_id, category_id)
);

-- owner_id is a visa application, booking or appointment id (no FK: it spans three tables).
CREATE TABLE documents (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id    uuid NOT NULL,
  item_id     text NOT NULL DEFAULT '',
  filename    text NOT NULL,
  mime        text NOT NULL CHECK (mime IN ('application/pdf','image/png','image/jpeg')),
  size        integer NOT NULL CHECK (size > 0),
  uploaded_at timestamptz NOT NULL
);
CREATE INDEX documents_owner_idx ON documents (user_id, owner_id);

CREATE TABLE bookings (
  id               uuid PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('flight','hotel','insurance')),
  status           text NOT NULL CHECK (status IN ('sample','requested','confirmed')),
  source           text NOT NULL CHECK (source IN ('demo','user-entered','provider')),
  title            text NOT NULL,
  start_date       date NOT NULL,
  end_date         date,
  confirmation_ref text,
  details          jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL,
  -- Defence in depth for "never fabricate a confirmation": the API enforces these too.
  CHECK (NOT (source = 'demo' AND (status <> 'sample' OR confirmation_ref IS NOT NULL))),
  CHECK (NOT (status = 'sample' AND confirmation_ref IS NOT NULL)),
  CHECK (NOT (status = 'confirmed' AND confirmation_ref IS NULL)),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX bookings_user_idx ON bookings (user_id, start_date);

CREATE TABLE appointments (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination_id  text NOT NULL DEFAULT '',
  center          text NOT NULL,
  type            text NOT NULL CHECK (type IN ('visa','biometrics','interview','other')),
  starts_at       text NOT NULL,                      -- floating local time 'YYYY-MM-DDTHH:mm', intentionally not timestamptz
  preferred_times text NOT NULL DEFAULT '',
  status          text NOT NULL CHECK (status IN ('requested','pending','confirmed')),
  official_ref    text,
  reminder_days   integer NOT NULL DEFAULT 0 CHECK (reminder_days BETWEEN 0 AND 30),
  notes           text NOT NULL DEFAULT '',
  checklist       jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL,
  CHECK (NOT (status = 'confirmed' AND official_ref IS NULL)),
  CHECK (NOT (status <> 'confirmed' AND official_ref IS NOT NULL))
);
CREATE INDEX appointments_user_idx ON appointments (user_id, starts_at);

-- Row-level security: enabled with NO policies, so the public anon/authenticated API can read nothing.
-- Only the server (service-role key, which bypasses RLS) touches these tables.
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips              ENABLE ROW LEVEL SECURITY;
ALTER TABLE visa_applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments       ENABLE ROW LEVEL SECURITY;

-- Private bucket for passports and other documents. public = false means files are reachable only via
-- signed URLs minted by the server (valid 5 minutes). Do NOT add storage policies for anon users.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 4194304, ARRAY['application/pdf','image/png','image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false;
