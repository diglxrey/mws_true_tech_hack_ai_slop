-- 004_wiki_tags.sql
-- Wiki tag entities and page-tag relationships

CREATE TABLE IF NOT EXISTS wiki_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wiki_page_tags (
  page_id     UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES wiki_tags(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_wiki_page_tags_tag ON wiki_page_tags (tag_id);
