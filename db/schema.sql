CREATE TABLE IF NOT EXISTS production_items (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  cas TEXT NOT NULL DEFAULT '',
  cat TEXT NOT NULL DEFAULT '',
  batch TEXT NOT NULL DEFAULT '',
  formula TEXT NOT NULL DEFAULT '',
  weight TEXT NOT NULL DEFAULT '',
  density TEXT NOT NULL DEFAULT '',
  pack TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS production_items_updated_at_idx
  ON production_items (updated_at DESC);
