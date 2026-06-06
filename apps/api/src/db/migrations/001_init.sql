CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  template TEXT NOT NULL,
  cache_ttl_seconds INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS snippet_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL REFERENCES snippets (id) ON DELETE CASCADE,
  placeholder_name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('scalar', 'aggregate', 'concat')),
  source_table TEXT NOT NULL,
  source_column TEXT NOT NULL,
  aggregate_fn TEXT,
  concat_separator TEXT,
  concat_order_column TEXT,
  concat_order_dir TEXT,
  concat_limit INTEGER,
  filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  fallback_value TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT snippet_variables_aggregate_fn_check CHECK (
    aggregate_fn IS NULL
    OR aggregate_fn IN ('SUM', 'MIN', 'MAX', 'COUNT', 'AVG')
  ),
  CONSTRAINT snippet_variables_concat_order_dir_check CHECK (
    concat_order_dir IS NULL
    OR concat_order_dir IN ('ASC', 'DESC')
  ),
  UNIQUE (snippet_id, placeholder_name)
);

CREATE INDEX IF NOT EXISTS idx_snippet_variables_snippet_id ON snippet_variables (snippet_id);

CREATE OR REPLACE FUNCTION snippets_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS snippets_updated_at ON snippets;
CREATE TRIGGER snippets_updated_at
  BEFORE UPDATE ON snippets
  FOR EACH ROW
  EXECUTE FUNCTION snippets_set_updated_at();
