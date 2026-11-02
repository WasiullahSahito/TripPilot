-- Paid orders (real booking + payment). Run after 001-004 in the Supabase SQL editor.
CREATE TABLE orders (
  id                       uuid PRIMARY KEY,
  user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind                     text NOT NULL CHECK (kind IN ('flight','hotel','insurance')),
  status                   text NOT NULL CHECK (status IN ('awaiting_payment','fulfilling','fulfilled','refunded','needs_attention','expired')),
  gateway                  text NOT NULL CHECK (gateway IN ('stripe','safepay')),
  provider                 text NOT NULL,
  offer_id                 text NOT NULL,
  title                    text NOT NULL,
  start_date               date NOT NULL,
  end_date                 date,
  amount_minor             bigint NOT NULL CHECK (amount_minor > 0),
  fee_minor                bigint NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  currency                 char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  payment_session_id        text,
  payment_ref text,
  provider_order_id        text,
  reference                text,
  tickets                  jsonb NOT NULL DEFAULT '[]',
  booking_id               uuid,
  note                     text,
  data_enc                 text NOT NULL,              -- travellers + contact, AES-256-GCM (same key as visa data)
  created_at               timestamptz NOT NULL,
  updated_at               timestamptz NOT NULL,
  -- "Never fabricate a confirmation": a fulfilled order must carry the provider's own reference.
  CHECK (NOT (status = 'fulfilled' AND (reference IS NULL OR provider_order_id IS NULL)))
);
CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
CREATE UNIQUE INDEX orders_session_idx ON orders (payment_session_id) WHERE payment_session_id IS NOT NULL;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
