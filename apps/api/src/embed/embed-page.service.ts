import { Injectable, NotFoundException } from "@nestjs/common"
import { AppConfigService } from "../config/app-config.service"
import { RenderCacheService, embedPageCacheKey } from "../redis/render-cache.service"
import { RenderService } from "../snippets/render.service"
import { SnippetsRepository } from "../snippets/snippets.repository"
import { CssSanitizeService } from "../snippets/sanitize/css-sanitize.service"
import { prefixSnippetCss } from "../snippets/sanitize/prefix-snippet-css"
import { ThemesRepository } from "../themes/themes.repository"
import { DEFAULT_EMBED_CSS_VARS } from "./default-theme"
import {
  sanitizeCssVarValue,
  splitEmbedQuery,
  type SplitEmbedQueryResult,
} from "./embed-query.util"
import { corsHeadersForSnippet } from "./snippet-cors.util"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}

function mergeThemeVars(
  split: SplitEmbedQueryResult,
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

const RESIZE_SCRIPT = (slug: string) => `(function() {
      function sendHeight() {
        var h = document.body.scrollHeight;
        window.parent.postMessage({ type: 'sn-resize', slug: ${JSON.stringify(slug)}, height: h }, '*');
      }
      sendHeight();
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(sendHeight).observe(document.body);
      }
    })();`

@Injectable()
export class EmbedPageService {
  constructor(
    private readonly repo: SnippetsRepository,
    private readonly render: RenderService,
    private readonly themes: ThemesRepository,
    private readonly cache: RenderCacheService,
    private readonly cssSanitize: CssSanitizeService,
    private readonly appConfig: AppConfigService,
  ) {}

  async renderEmbedPage(
    slug: string,
    query: Record<string, string>,
    requestOrigin: string | undefined,
  ): Promise<{ html: string; fromCache: boolean; corsHeaders: Record<string, string>; allowedOrigins: string[] }> {
    const snippet = await this.repo.findBySlug(slug)
    if (!snippet || !snippet.is_active || !snippet.is_public) {
      throw new NotFoundException()
    }

    const corsHeaders = corsHeadersForSnippet(snippet.allowed_origins, requestOrigin)
    const allowedOrigins = snippet.allowed_origins

    const key = embedPageCacheKey(slug, query)
    const ttl = snippet.cache_ttl_seconds
    if (ttl > 0) {
      const hit = await this.cache.get(key)
      if (hit) {
        return { html: hit, fromCache: true, corsHeaders, allowedOrigins }
      }
    }

    const split = splitEmbedQuery(query)
    const preset = split.themeSlug ? await this.themes.findByName(split.themeSlug) : null
    const payload = await this.render.render(snippet, split.context, { useCache: true })
    const vars = mergeThemeVars(split, snippet.theme, preset?.variables ?? null)

    let prefixedCss = ""
    if (snippet.css?.trim()) {
      const safe = this.cssSanitize.sanitize(snippet.css)
      prefixedCss = await prefixSnippetCss(safe, snippet.slug)
    }

    const title = `snippet: ${slug}`
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body { display: flex; align-items: flex-start; }
    ${rootVarsBlock(vars)}
    ${prefixedCss}
  </style>
</head>
<body>
  <div data-sn-id="${escapeAttr(snippet.slug)}">
${payload.text}
  </div>
  <script>
    ${RESIZE_SCRIPT(snippet.slug)}
  </script>
</body>
</html>`

    if (ttl > 0) {
      await this.cache.set(key, ttl, html)
    }

    return { html, fromCache: false, corsHeaders, allowedOrigins }
  }

  getPublicBaseUrl(): string {
    return this.appConfig.publicBaseUrl()
  }
}
