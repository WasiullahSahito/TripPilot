-- Admin tools and automatic file deletion. Run after 001, 002 and 003 in the Supabase SQL editor.

-- Admins can disable an account: it cannot log in and its sessions stop working.
ALTER TABLE users ADD COLUMN disabled_at timestamptz;

-- Opt-in retention: delete a user's uploaded files N days after the related trip/booking/appointment.
ALTER TABLE profiles ADD COLUMN retention_days integer CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 3650);

-- Audit log. Ids and small flags only (never names, emails, passport data or file names).
-- No foreign keys on purpose: entries must survive deletion of the people they mention.
CREATE TABLE audit_log (
  id        uuid PRIMARY KEY,
  at        timestamptz NOT NULL,
  actor_id  uuid,
  action    text NOT NULL,
  target_id uuid,
  meta      jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);
CREATE INDEX audit_log_action_idx ON audit_log (action, at DESC);

-- Same rule as every other table: RLS on, no public policies (only the server's service-role key can read).
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
