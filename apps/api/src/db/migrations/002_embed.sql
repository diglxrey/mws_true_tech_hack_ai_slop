-- Embed & HTML mode

ALTER TABLE snippets ADD COLUMN IF NOT EXISTS render_mode TEXT NOT NULL DEFAULT 'text';
ALTER TABLE snippets DROP CONSTRAINT IF EXISTS snippets_render_mode_check;
ALTER TABLE snippets ADD CONSTRAINT snippets_render_mode_check CHECK (render_mode IN ('text', 'html'));

ALTER TABLE snippets ADD COLUMN IF NOT EXISTS html_template TEXT;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS css TEXT;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS theme JSONB;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS allowed_origins TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS embed_width TEXT;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS embed_height TEXT;

CREATE TABLE IF NOT EXISTS snippet_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_snippet_themes_one_default ON snippet_themes (is_default)
  WHERE is_default = true;

INSERT INTO snippet_themes (name, variables, is_default)
SELECT 'default',
  jsonb_build_object(
    '--sn-bg', '#ffffff',
    '--sn-color', '#1a1a1a',
    '--sn-accent', '#2e75b6',
    '--sn-font', 'system-ui, sans-serif',
    '--sn-font-size', '16px',
    '--sn-radius', '8px',
    '--sn-padding', '16px',
    '--sn-border', '1px solid #e0e0e0',
    '--sn-shadow', '0 2px 8px rgba(0,0,0,0.08)'
  ),
  true
WHERE NOT EXISTS (SELECT 1 FROM snippet_themes WHERE name = 'default');
