-- 003_wiki.sql
-- Wiki pages, snapshots, links, comments, versions, drafts, MWS block configs

CREATE TABLE IF NOT EXISTS wiki_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  parent_id   UUID REFERENCES wiki_pages(id) ON DELETE SET NULL,
  icon        TEXT,
  cover_url   TEXT,
  is_deleted  BOOLEAN NOT NULL DEFAULT false,
  created_by  TEXT NOT NULL DEFAULT 'system',
  updated_by  TEXT NOT NULL DEFAULT 'system',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Yjs document snapshots (last N per page, used for collab session recovery)
CREATE TABLE IF NOT EXISTS wiki_page_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  ydoc_state  BYTEA NOT NULL,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wiki_snapshots_page_saved
  ON wiki_page_snapshots (page_id, saved_at DESC);

-- Page link graph (extracted from document content after each save)
CREATE TABLE IF NOT EXISTS wiki_page_links (
  source_id  UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  target_id  UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_wiki_links_target ON wiki_page_links (target_id);

-- Block-level comments
CREATE TABLE IF NOT EXISTS wiki_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  block_id    TEXT NOT NULL,
  range_start INTEGER,
  range_end   INTEGER,
  author      TEXT NOT NULL DEFAULT 'anonymous',
  body        TEXT NOT NULL,
  resolved    BOOLEAN NOT NULL DEFAULT false,
  parent_id   UUID REFERENCES wiki_comments(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wiki_comments_page ON wiki_comments (page_id, block_id);

-- Named version history
CREATE TABLE IF NOT EXISTS wiki_page_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  version_num INTEGER NOT NULL,
  label       TEXT,
  ydoc_state  BYTEA NOT NULL,
  created_by  TEXT NOT NULL DEFAULT 'system',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, version_num)
);
CREATE INDEX IF NOT EXISTS idx_wiki_versions_page ON wiki_page_versions (page_id, version_num DESC);

-- Per-session drafts (browser-side recovery)
CREATE TABLE IF NOT EXISTS wiki_page_drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  ydoc_state  BYTEA NOT NULL,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, session_id)
);

-- MWS live table block configuration (one row per block per page)
CREATE TABLE IF NOT EXISTS wiki_mws_block_configs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id               UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  block_id              TEXT NOT NULL,
  dst_id                TEXT NOT NULL,
  view_id               TEXT,
  filter_by_formula     TEXT,
  page_size             INTEGER NOT NULL DEFAULT 50,
  refresh_interval_secs INTEGER NOT NULL DEFAULT 30,
  allow_edit_back       BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, block_id)
);

-- updated_at triggers
CREATE OR REPLACE FUNCTION wiki_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS wiki_pages_upd    ON wiki_pages;
DROP TRIGGER IF EXISTS wiki_comments_upd ON wiki_comments;
DROP TRIGGER IF EXISTS wiki_mws_upd      ON wiki_mws_block_configs;

CREATE TRIGGER wiki_pages_upd
  BEFORE UPDATE ON wiki_pages
  FOR EACH ROW EXECUTE FUNCTION wiki_set_updated_at();

CREATE TRIGGER wiki_comments_upd
  BEFORE UPDATE ON wiki_comments
  FOR EACH ROW EXECUTE FUNCTION wiki_set_updated_at();

CREATE TRIGGER wiki_mws_upd
  BEFORE UPDATE ON wiki_mws_block_configs
  FOR EACH ROW EXECUTE FUNCTION wiki_set_updated_at();
