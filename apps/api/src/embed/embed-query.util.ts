/** Reserved query keys → CSS variable names for embed URLs. */
export const EMBED_THEME_QUERY_TO_VAR: Record<string, string> = {
  _bg: "--sn-bg",
  _color: "--sn-color",
  _accent: "--sn-accent",
  _font: "--sn-font",
  _font_size: "--sn-font-size",
  _radius: "--sn-radius",
  _padding: "--sn-padding",
}

export interface SplitEmbedQueryResult {
  context: Record<string, string>
  themeSlug: string | undefined
  themeVarOverrides: Record<string, string>
}

/**
 * Keys starting with `_` are reserved; only known theme keys become CSS overrides.
 * `_theme` selects a preset from `snippet_themes`.
 */
export function splitEmbedQuery(query: Record<string, string>): SplitEmbedQueryResult {
  const context: Record<string, string> = {}
  const themeVarOverrides: Record<string, string> = {}
  let themeSlug: string | undefined
  for (const [k, v] of Object.entries(query)) {
    if (k === "_preview") {
      continue
    }
    if (k === "_theme") {
      themeSlug = v
      continue
    }
    if (k.startsWith("_")) {
      const varName = EMBED_THEME_QUERY_TO_VAR[k]
      if (varName) {
        themeVarOverrides[varName] = v
      }
      continue
    }
    context[k] = v
  }
  return { context, themeSlug, themeVarOverrides }
}

export function sanitizeCssVarValue(v: string): string {
  return v.replace(/[;{}]/g, "")
}
