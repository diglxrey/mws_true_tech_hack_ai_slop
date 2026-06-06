-- 005_auth.sql
-- Local mirror of Dex users + authorship columns for snippets

-- Local user directory (synced from Dex JWT claims on each login)
CREATE TABLE IF NOT EXISTS users (
  sub        TEXT PRIMARY KEY,  -- id_token.sub from Dex (stable identifier)
  email      TEXT,
  name       TEXT,
  groups     JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Drop hardcoded defaults in wiki tables so real user subs are stored instead.
-- Existing rows keep their current values ('system'/'anonymous') — no data loss.
ALTER TABLE wiki_pages         ALTER COLUMN created_by DROP DEFAULT;
ALTER TABLE wiki_pages         ALTER COLUMN updated_by DROP DEFAULT;
ALTER TABLE wiki_comments      ALTER COLUMN author     DROP DEFAULT;
ALTER TABLE wiki_page_versions ALTER COLUMN created_by DROP DEFAULT;

-- Add authorship tracking to snippets (new columns, nullable for existing rows)
ALTER TABLE snippets
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;
