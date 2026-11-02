-- Trip expenses (budget tracking). Run after 001 and 002 in the Supabase SQL editor.
CREATE TABLE expenses (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id     uuid REFERENCES trips(id) ON DELETE SET NULL,   -- deleting a trip keeps the expense, unlinked
  category    text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  currency    char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  spent_on    date NOT NULL,
  status      text NOT NULL DEFAULT 'estimated' CHECK (status IN ('estimated','paid')),
  created_at  timestamptz NOT NULL
);
CREATE INDEX expenses_user_idx ON expenses (user_id, spent_on DESC);
CREATE INDEX expenses_trip_idx ON expenses (trip_id);

-- Same rule as every other table: RLS on, no public policies (only the server's service-role key can read).
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
