import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { AppConfigService } from "../config/app-config.service"
import { InternalToolHttpException } from "../internal/internal-tool-error"
import { coerceFilters } from "./filter-validation"
import { MetaService } from "../meta/meta.service"
import { RenderCacheService } from "../redis/render-cache.service"
import { RenderService } from "./render.service"
import { SnippetsRepository } from "./snippets.repository"
import { HtmlSanitizeService } from "./sanitize/html-sanitize.service"
import { CssSanitizeService } from "./sanitize/css-sanitize.service"
import {
  assertCssSize,
  assertHtmlTemplateSize,
  assertPlaceholderName,
  assertTemplateSize,
  assertValidSlug,
  MAX_VARIABLES_PER_SNIPPET,
} from "./snippets-validation"
import type { SnippetFilter } from "../sql/sql-builder.types"

export interface CreateSnippetInput {
  slug: string
  name: string
  description?: string
  template: string
  cache_ttl_seconds?: number
  is_active?: boolean
  render_mode?: "text" | "html"
  html_template?: string | null
  css?: string | null
  theme?: Record<string, string> | null
  is_public?: boolean
  allowed_origins?: string[]
  embed_width?: string | null
  embed_height?: string | null
}

export interface CreateVariableInput {
  placeholder_name: string
  mode: "scalar" | "aggregate" | "concat"
  source_table: string
  source_column: string
  aggregate_fn?: string | null
  concat_separator?: string | null
  concat_order_column?: string | null
  concat_order_dir?: "ASC" | "DESC" | null
  concat_limit?: number | null
  filters?: unknown
  fallback_value?: string
  sort_order?: number
}

@Injectable()
export class SnippetsService {
  constructor(
    private readonly repo: SnippetsRepository,
    private readonly meta: MetaService,
    private readonly render: RenderService,
    private readonly cache: RenderCacheService,
    private readonly htmlSanitize: HtmlSanitizeService,
    private readonly cssSanitize: CssSanitizeService,
    private readonly appConfig: AppConfigService,
  ) {}

  listPublic() {
    return this.repo.findPublicSummaries()
  }

  listAdmin() {
    return this.repo.findAdminSummaries()
  }

  async getByIdOrThrow(id: string) {
    const s = await this.repo.findById(id)
    if (!s) throw new NotFoundException()
    return s
  }

  async createSnippet(input: CreateSnippetInput) {
    assertValidSlug(input.slug)
    assertTemplateSize(input.template)
    const normalized = this.normalizeSnippetFields(input)
    try {
      const row = await this.repo.createSnippet({
        slug: input.slug,
        name: input.name,
        description: input.description ?? "",
        template: input.template,
        cache_ttl_seconds: input.cache_ttl_seconds ?? 0,
        is_active: input.is_active ?? true,
        ...normalized,
      })
      return row
    } catch (e: unknown) {
      const err = e as { code?: string }
      if (err.code === "23505") {
        throw new ConflictException("slug already exists")
      }
      throw e
    }
  }

  async updateSnippet(id: string, input: Partial<CreateSnippetInput>) {
    const cur = await this.repo.findSnippetEntityById(id)
    if (!cur) throw new NotFoundException()
    if (input.slug !== undefined) assertValidSlug(input.slug)
    if (input.template !== undefined) assertTemplateSize(input.template)
    const embedTouched =
      input.render_mode !== undefined ||
      input.html_template !== undefined ||
      input.css !== undefined ||
      input.theme !== undefined ||
      input.is_public !== undefined ||
      input.allowed_origins !== undefined ||
      input.embed_width !== undefined ||
      input.embed_height !== undefined
    const merged: CreateSnippetInput = {
      slug: input.slug ?? cur.slug,
      name: input.name ?? cur.name,
      description: input.description ?? cur.description,
      template: input.template ?? cur.template,
      cache_ttl_seconds: input.cache_ttl_seconds ?? cur.cache_ttl_seconds,
      is_active: input.is_active ?? cur.is_active,
      render_mode: input.render_mode ?? cur.render_mode,
      html_template: input.html_template !== undefined ? input.html_template : cur.html_template,
      css: input.css !== undefined ? input.css : cur.css,
      theme: input.theme !== undefined ? input.theme : cur.theme,
      is_public: input.is_public ?? cur.is_public,
      allowed_origins: input.allowed_origins ?? cur.allowed_origins,
      embed_width: input.embed_width !== undefined ? input.embed_width : cur.embed_width,
      embed_height: input.embed_height !== undefined ? input.embed_height : cur.embed_height,
    }
    const normalized = embedTouched ? this.normalizeSnippetFields(merged) : null
    try {
      const row = await this.repo.updateSnippet(id, {
        slug: input.slug,
        name: input.name,
        description: input.description,
        template: input.template,
        cache_ttl_seconds: input.cache_ttl_seconds,
        is_active: input.is_active,
        ...(embedTouched && normalized
          ? {
              render_mode: normalized.render_mode,
              html_template: normalized.html_template,
              css: normalized.css,
              theme: normalized.theme,
              is_public: normalized.is_public,
              allowed_origins: normalized.allowed_origins,
              embed_width: normalized.embed_width,
              embed_height: normalized.embed_height,
            }
          : {}),
      })
      if (!row) throw new NotFoundException()
      await this.cache.invalidateSlug(cur.slug)
      if (input.slug && input.slug !== cur.slug) {
        await this.cache.invalidateSlug(input.slug)
      }
      return row
    } catch (e: unknown) {
      const err = e as { code?: string }
      if (err.code === "23505") {
        throw new ConflictException("slug already exists")
      }
      throw e
    }
  }

  async deleteSnippet(id: string) {
    const cur = await this.repo.findSnippetEntityById(id)
    if (!cur) throw new NotFoundException()
    await this.repo.deleteSnippet(id)
    await this.cache.invalidateSlug(cur.slug)
  }

  async duplicateSnippet(id: string, newSlug: string) {
    assertValidSlug(newSlug)
    const dup = await this.repo.duplicateSnippet(id, newSlug)
    if (!dup) throw new NotFoundException()
    return dup
  }

  async renderBySlug(
    slug: string,
    context: Record<string, string>,
    options?: { allowInactive?: boolean; useCache?: boolean },
  ) {
    const snippet = await this.repo.findBySlug(slug)
    if (!snippet) throw new NotFoundException()
    if (!snippet.is_active && !options?.allowInactive) {
      throw new NotFoundException()
    }
    return this.render.render(snippet, context, { useCache: options?.useCache })
  }

  async previewAdminSnippet(snippetId: string, context: Record<string, string>) {
    const s = await this.getByIdOrThrow(snippetId)
    return this.render.render(s, context, { useCache: false })
  }

  async validateVariableInput(input: CreateVariableInput): Promise<{
    filters: SnippetFilter[]
    aggregate_fn: string | null
    concat_separator: string | null
    concat_order_column: string | null
    concat_order_dir: "ASC" | "DESC" | null
    concat_limit: number | null
  }> {
    assertPlaceholderName(input.placeholder_name)
    const filters = coerceFilters(input.filters ?? [])
    const allowed = await this.meta.isTableAllowed(input.source_table)
    if (!allowed) {
      throw new BadRequestException("source_table is not allowed")
    }
    const cols = await this.meta.columnSetForTable(input.source_table)
    if (!(input.source_column === "*" && input.mode === "aggregate" && input.aggregate_fn === "COUNT")) {
      if (!cols.has(input.source_column)) {
        throw new BadRequestException("source_column not found on table")
      }
    }
    for (const f of filters) {
      if (!cols.has(f.column)) {
        throw new BadRequestException(`Filter column not found: ${f.column}`)
      }
    }
    if (input.concat_order_column && !cols.has(input.concat_order_column)) {
      throw new BadRequestException("concat_order_column not found on table")
    }

    let aggregate_fn: string | null = input.aggregate_fn ?? null
    if (input.mode === "aggregate") {
      if (!aggregate_fn) {
        throw new BadRequestException("aggregate_fn required for aggregate mode")
      }
    } else {
      aggregate_fn = null
    }

    if (input.mode === "concat") {
      if (input.concat_limit != null && (input.concat_limit < 1 || input.concat_limit > 10_000)) {
        throw new BadRequestException("concat_limit out of range")
      }
    }

    return {
      filters,
      aggregate_fn,
      concat_separator: input.concat_separator ?? null,
      concat_order_column: input.concat_order_column ?? null,
      concat_order_dir: input.concat_order_dir ?? null,
      concat_limit: input.concat_limit ?? null,
    }
  }

  async addVariable(snippetId: string, input: CreateVariableInput) {
    const snippet = await this.getByIdOrThrow(snippetId)
    const n = await this.repo.countVariables(snippetId)
    if (n >= MAX_VARIABLES_PER_SNIPPET) {
      throw new BadRequestException(`At most ${MAX_VARIABLES_PER_SNIPPET} variables`)
    }
    const v = await this.validateVariableInput(input)
    try {
      const row = await this.repo.createVariable(snippetId, {
        placeholder_name: input.placeholder_name,
        mode: input.mode,
        source_table: input.source_table,
        source_column: input.source_column,
        aggregate_fn: v.aggregate_fn,
        concat_separator: v.concat_separator,
        concat_order_column: v.concat_order_column,
        concat_order_dir: v.concat_order_dir,
        concat_limit: v.concat_limit,
        filters: v.filters,
        fallback_value: input.fallback_value ?? "",
        sort_order: input.sort_order ?? n,
      })
      await this.cache.invalidateSlug(snippet.slug)
      return row
    } catch (e: unknown) {
      const err = e as { code?: string }
      if (err.code === "23505") {
        throw new ConflictException("placeholder_name already exists for this snippet")
      }
      throw e
    }
  }

  async patchVariable(variableId: string, input: Partial<CreateVariableInput>) {
    const slug = await this.repo.getSnippetSlugByVariableId(variableId)
    if (!slug) throw new NotFoundException()
    const cur = await this.repo.findBySlug(slug)
    if (!cur) throw new NotFoundException()
    const existing = cur.variables.find((x) => x.id === variableId)
    if (!existing) throw new NotFoundException()

    const merged: CreateVariableInput = {
      placeholder_name: input.placeholder_name ?? existing.placeholder_name,
      mode: (input.mode ?? existing.mode) as CreateVariableInput["mode"],
      source_table: input.source_table ?? existing.source_table,
      source_column: input.source_column ?? existing.source_column,
      aggregate_fn:
        input.aggregate_fn !== undefined ? input.aggregate_fn : existing.aggregate_fn,
      concat_separator:
        input.concat_separator !== undefined ? input.concat_separator : existing.concat_separator,
      concat_order_column:
        input.concat_order_column !== undefined
          ? input.concat_order_column
          : existing.concat_order_column,
      concat_order_dir:
        input.concat_order_dir !== undefined ? input.concat_order_dir : existing.concat_order_dir,
      concat_limit: input.concat_limit !== undefined ? input.concat_limit : existing.concat_limit,
      filters: input.filters !== undefined ? input.filters : existing.filters,
      fallback_value:
        input.fallback_value !== undefined ? input.fallback_value : existing.fallback_value,
      sort_order: input.sort_order !== undefined ? input.sort_order : existing.sort_order,
    }

    const v = await this.validateVariableInput(merged)
    const row = await this.repo.updateVariable(variableId, {
      placeholder_name: merged.placeholder_name,
      mode: merged.mode,
      source_table: merged.source_table,
      source_column: merged.source_column,
      aggregate_fn: v.aggregate_fn,
      concat_separator: v.concat_separator,
      concat_order_column: v.concat_order_column,
      concat_order_dir: v.concat_order_dir,
      concat_limit: v.concat_limit,
      filters: v.filters,
      fallback_value: merged.fallback_value ?? "",
      sort_order: merged.sort_order ?? 0,
    })
    if (!row) throw new NotFoundException()
    await this.cache.invalidateSlug(slug)
    return row
  }

  async removeVariable(variableId: string) {
    const slug = await this.repo.getSnippetSlugByVariableId(variableId)
    if (!slug) throw new NotFoundException()
    await this.repo.deleteVariable(variableId)
    await this.cache.invalidateSlug(slug)
  }

  async testVariable(variableId: string, context: Record<string, string>) {
    const variable = await this.repo.findVariableById(variableId)
    if (!variable) throw new NotFoundException()
    return this.render.evaluateVariable(variable, context)
  }

  async previewSql(variableId: string, context: Record<string, string>) {
    const variable = await this.repo.findVariableById(variableId)
    if (!variable) throw new NotFoundException()
    return this.render.previewSqlAsync(variable, context)
  }

  listForInternalTools() {
    return this.repo.findAdminSummaries().then((rows) =>
      rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        description: r.description ?? "",
        is_active: r.is_active,
        variables_count: r.variable_count,
      })),
    )
  }

  async getBySlugOrThrow(slug: string) {
    const s = await this.repo.findBySlug(slug)
    if (!s) {
      throw new InternalToolHttpException(
        "SNIPPET_NOT_FOUND",
        `Snippet '${slug}' not found`,
        HttpStatus.NOT_FOUND,
      )
    }
    return s
  }

  async updateSnippetBySlug(slug: string, input: Partial<CreateSnippetInput>) {
    const cur = await this.repo.findBySlug(slug)
    if (!cur) {
      throw new InternalToolHttpException(
        "SNIPPET_NOT_FOUND",
        `Snippet '${slug}' not found`,
        HttpStatus.NOT_FOUND,
      )
    }
    return this.updateSnippet(cur.id, input)
  }

  async deleteSnippetBySlug(slug: string) {
    const cur = await this.repo.findBySlug(slug)
    if (!cur) {
      throw new InternalToolHttpException(
        "SNIPPET_NOT_FOUND",
        `Snippet '${slug}' not found`,
        HttpStatus.NOT_FOUND,
      )
    }
    await this.deleteSnippet(cur.id)
  }

  async previewSnippetBySlug(slug: string, context: Record<string, string>) {
    try {
      return await this.renderBySlug(slug, context, { allowInactive: true, useCache: false })
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new InternalToolHttpException(
          "SNIPPET_NOT_FOUND",
          `Snippet '${slug}' not found`,
          HttpStatus.NOT_FOUND,
        )
      }
      throw e
    }
  }

  async setVariableBySlug(snippetSlug: string, input: CreateVariableInput) {
    const snippet = await this.repo.findBySlug(snippetSlug)
    if (!snippet) {
      throw new InternalToolHttpException(
        "SNIPPET_NOT_FOUND",
        `Snippet '${snippetSlug}' not found`,
        HttpStatus.NOT_FOUND,
      )
    }
    const existingId = await this.repo.findVariableIdBySnippetSlugAndPlaceholder(
      snippetSlug,
      input.placeholder_name,
    )
    if (existingId) {
      await this.patchVariable(existingId, input)
    } else {
      await this.addVariable(snippet.id, input)
    }
    return { placeholder_name: input.placeholder_name, created_or_updated: true as const }
  }

  async deleteVariableBySlug(snippetSlug: string, placeholderName: string) {
    const snippet = await this.repo.findBySlug(snippetSlug)
    if (!snippet) {
      throw new InternalToolHttpException(
        "SNIPPET_NOT_FOUND",
        `Snippet '${snippetSlug}' not found`,
        HttpStatus.NOT_FOUND,
      )
    }
    const id = await this.repo.findVariableIdBySnippetSlugAndPlaceholder(snippetSlug, placeholderName)
    if (!id) {
      throw new InternalToolHttpException(
        "VARIABLE_NOT_FOUND",
        `Variable '${placeholderName}' not found on snippet '${snippetSlug}'`,
        HttpStatus.NOT_FOUND,
      )
    }
    await this.removeVariable(id)
    return { placeholder_name: placeholderName, deleted: true as const }
  }

  async getEmbedCode(id: string, format: "iframe" | "webcomponent" | "share") {
    const s = await this.getByIdOrThrow(id)
    const base = this.publicBaseUrl()
    const slug = s.slug
    const width = s.embed_width ?? "100%"
    const height = s.embed_height ?? "auto"
    const escAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    if (format === "share") {
      const url = `${base}/s/${encodeURIComponent(slug)}`
      return { format, slug, url, code: url }
    }
    if (format === "webcomponent") {
      const sdk = `${base}/sdk/v1/snippet.js`
      return {
        format,
        slug,
        code: `<script src="${escAttr(sdk)}" async></script>\n<sn-snippet slug="${escAttr(slug)}"></sn-snippet>`,
      }
    }
    const src = `${base}/embed/${encodeURIComponent(slug)}`
    const iframe = `<iframe
  src="${escAttr(src)}"
  width="${escAttr(width)}"
  height="${escAttr(height)}"
  style="border: none; overflow: hidden;"
  sandbox="allow-scripts allow-same-origin"
  loading="lazy"
  title="${escAttr(slug)}"
></iframe>`
    const script = `<script>
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'sn-resize' && e.data.slug === ${JSON.stringify(slug)}) {
      var iframe = document.querySelector('iframe[title=${JSON.stringify(slug)}]');
      if (iframe) iframe.style.height = e.data.height + 'px';
    }
  });
</script>`
    return { format, slug, embedUrl: src, code: `${iframe}\n${script}` }
  }

  private publicBaseUrl(): string {
    return this.appConfig.publicBaseUrl()
  }

  async testVariableBySlug(
    snippetSlug: string,
    placeholderName: string,
    context: Record<string, string>,
  ) {
    const s = await this.repo.findBySlug(snippetSlug)
    if (!s) {
      throw new InternalToolHttpException(
        "SNIPPET_NOT_FOUND",
        `Snippet '${snippetSlug}' not found`,
        HttpStatus.NOT_FOUND,
      )
    }
    const variable = s.variables.find((v) => v.placeholder_name === placeholderName)
    if (!variable) {
      throw new InternalToolHttpException(
        "VARIABLE_NOT_FOUND",
        `Variable '${placeholderName}' not found on snippet '${snippetSlug}'`,
        HttpStatus.NOT_FOUND,
      )
    }
    const sqlPreview = await this.render.previewSqlAsync(variable, context)
    if ("missingContextKey" in sqlPreview) {
      throw new BadRequestException({
        message: "Missing context parameter",
        missingContextKey: sqlPreview.missingContextKey,
      })
    }
    const evaluated = await this.render.evaluateVariable(variable, context)
    return {
      value: evaluated.value,
      status: evaluated.status,
      sql_preview: sqlPreview.previewSql,
      duration_ms: evaluated.duration_ms,
    }
  }

  private normalizeSnippetFields(input: CreateSnippetInput) {
    const mode = input.render_mode ?? "text"
    let html_template = input.html_template ?? null
    let css = input.css ?? null
    const theme = input.theme ?? null
    if (mode === "html") {
      if (!html_template?.trim()) {
        throw new BadRequestException("html_template is required when render_mode is html")
      }
      assertHtmlTemplateSize(html_template)
      html_template = this.htmlSanitize.sanitize(html_template)
    }
    if (css) {
      assertCssSize(css)
      css = this.cssSanitize.sanitize(css)
    }
    return {
      render_mode: mode,
      html_template,
      css,
      theme,
      is_public: input.is_public ?? false,
      allowed_origins: (input.allowed_origins ?? []).map((s) => s.trim()).filter(Boolean),
      embed_width: input.embed_width?.trim() || null,
      embed_height: input.embed_height?.trim() || null,
    }
  }
}
