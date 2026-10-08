-- CarbonLens schema. Applied idempotently on boot and by the seed script.
-- Tables: credits, findings, verifications, anchor_receipts.

CREATE TABLE IF NOT EXISTS credits (
  id            TEXT PRIMARY KEY,
  registry      TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  project_name  TEXT NOT NULL,
  vintage       INTEGER NOT NULL,
  serial_start  BIGINT NOT NULL,
  serial_end    BIGINT NOT NULL,
  quantity_tco2e NUMERIC NOT NULL,
  methodology   TEXT NOT NULL DEFAULT '',
  standard      TEXT NOT NULL DEFAULT '',
  proponent     TEXT NOT NULL DEFAULT '',
  source_doc_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'verified', 'anchored', 'retired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS credits_source_doc_hash_idx
  ON credits (source_doc_hash, id);

CREATE TABLE IF NOT EXISTS findings (
  id          SERIAL PRIMARY KEY,
  credit_id   TEXT NOT NULL REFERENCES credits (id) ON DELETE CASCADE,
  check_type  TEXT NOT NULL CHECK (check_type IN ('duplicate', 'provenance', 'anomaly')),
  severity    TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message     TEXT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS findings_credit_id_idx ON findings (credit_id);

CREATE TABLE IF NOT EXISTS verifications (
  id            SERIAL PRIMARY KEY,
  credit_id     TEXT NOT NULL REFERENCES credits (id) ON DELETE CASCADE,
  verdict       TEXT NOT NULL CHECK (verdict IN ('VERIFIED', 'NEEDS_REVIEW', 'REJECTED')),
  findings_hash TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'api'
                CHECK (source IN ('seed', 'api', 'manual')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS verifications_credit_id_idx
  ON verifications (credit_id, created_at DESC);

CREATE TABLE IF NOT EXISTS anchor_receipts (
  credit_id_hash TEXT PRIMARY KEY,
  credit_id      TEXT NOT NULL REFERENCES credits (id) ON DELETE CASCADE,
  tx_hash        TEXT NOT NULL,
  block_number   BIGINT,
  network        TEXT NOT NULL DEFAULT 'amoy',
  verdict        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
