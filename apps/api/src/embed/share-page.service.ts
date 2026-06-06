import { Injectable, NotFoundException } from "@nestjs/common"
import { AppConfigService } from "../config/app-config.service"
import { RenderCacheService, sharePageCacheKey } from "../redis/render-cache.service"
import { RenderService } from "../snippets/render.service"
import { SnippetsRepository } from "../snippets/snippets.repository"
import { CssSanitizeService } from "../snippets/sanitize/css-sanitize.service"
import { prefixSnippetCss } from "../snippets/sanitize/prefix-snippet-css"
import { ThemesRepository } from "../themes/themes.repository"
import { DEFAULT_EMBED_CSS_VARS } from "./default-theme"
import { sanitizeCssVarValue, splitEmbedQuery } from "./embed-query.util"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function stripHtmlToText(s: string, maxLen: number): string {
  const t = s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  return t.length <= maxLen ? t : `${t.slice(0, maxLen)}…`
}

function mergeThemeVars(
  split: ReturnType<typeof splitEmbedQuery>,
  snippetTheme: Record<string, string> | null,
  presetVars: Record<string, string> | null,
): Record<string, string> {
  const merged: Record<string, string> = { ...DEFAULT_EMBED_CSS_VARS }
  if (presetVars) {
    for (const [k, v] of Object.entries(presetVars)) {
      merged[k] = sanitizeCssVarValue(v)
    }
  }
  if (snippetTheme) {
    for (const [k, v] of Object.entries(snippetTheme)) {
      merged[k] = sanitizeCssVarValue(v)
    }
  }
  for (const [k, v] of Object.entries(split.themeVarOverrides)) {
    merged[k] = sanitizeCssVarValue(v)
  }
  return merged
}

function rootVarsBlock(vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(([k, v]) => `      ${k}: ${v};`)
  return `:root {\n${lines.join("\n")}\n    }`
}

@Injectable()
export class SharePageService {
  constructor(
    private readonly repo: SnippetsRepository,
    private readonly render: RenderService,
    private readonly themes: ThemesRepository,
    private readonly cache: RenderCacheService,
    private readonly cssSanitize: CssSanitizeService,
    private readonly appConfig: AppConfigService,
  ) {}

  async renderSharePage(slug: string, query: Record<string, string>): Promise<{ html: string; fromCache: boolean }> {
    const previewRequested = query["_preview"] === "1"

    const snippet = await this.repo.findBySlug(slug)
    if (!snippet || !snippet.is_active || !snippet.is_public) {
      throw new NotFoundException()
    }

    const key = sharePageCacheKey(slug, query)
    const ttl = snippet.cache_ttl_seconds
    if (ttl > 0 && !previewRequested) {
      const hit = await this.cache.get(key)
      if (hit) {
        return { html: hit, fromCache: true }
      }
    }

    const split = splitEmbedQuery(query)
    const preset = split.themeSlug ? await this.themes.findByName(split.themeSlug) : null
    const payload = await this.render.render(snippet, split.context, { useCache: !previewRequested })
    const vars = mergeThemeVars(split, snippet.theme, preset?.variables ?? null)

    let prefixedCss = ""
    if (snippet.css?.trim()) {
      const safe = this.cssSanitize.sanitize(snippet.css)
      prefixedCss = await prefixSnippetCss(safe, snippet.slug)
    }

    const baseUrl = this.getPublicBaseUrl()
    const ogUrl = `${baseUrl}/s/${encodeURIComponent(slug)}`
    const ogTitle = `${snippet.slug} — Snippet`
    const ogDesc = stripHtmlToText(payload.text, 200)

    let previewBlock = ""
    if (previewRequested) {
      const varLines = snippet.variables
        .map((v) => `<li>${escapeHtml(v.placeholder_name)} (${escapeHtml(v.mode)})</li>`)
        .join("")
      previewBlock = `
      <section style="margin-top:1rem;padding:1rem;border:1px dashed #888;font-size:12px;font-family:monospace">
        <div>slug: ${escapeHtml(snippet.slug)}</div>
        <div>render_mode: ${escapeHtml(snippet.render_mode)}</div>
        <ul>${varLines}</ul>
      </section>`
    }

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDesc)}">
  <meta property="og:url" content="${escapeHtml(ogUrl)}">
  <title>${escapeHtml(ogTitle)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; }
    ${rootVarsBlock(vars)}
    ${prefixedCss}
  </style>
</head>
<body>
  <header>
    <h1 style="font-size:1.25rem;margin:0 0 8px">${escapeHtml(snippet.name)}</h1>
    <p style="color:#666;font-size:0.875rem;margin:0">Updated: ${escapeHtml(
      snippet.updated_at instanceof Date ? snippet.updated_at.toISOString() : String(snippet.updated_at),
    )}</p>
  </header>
  <main style="margin-top:16px">
    <div data-sn-id="${escapeHtml(snippet.slug)}">
${payload.text}
    </div>
    ${previewBlock}
  </main>
</body>
</html>`

    if (ttl > 0 && !previewRequested) {
      await this.cache.set(key, ttl, html)
    }

    return { html, fromCache: false }
  }

  getPublicBaseUrl(): string {
    return this.appConfig.publicBaseUrl()
  }
}
