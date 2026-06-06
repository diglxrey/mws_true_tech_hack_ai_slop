import { Inject, Injectable } from "@nestjs/common"
import type { Pool, PoolClient } from "pg"
import { coerceFilters } from "./filter-validation"
import type { SnippetFilter } from "../sql/sql-builder.types"
import type { SnippetVariableRow } from "../sql/sql-builder.types"

export interface SnippetEntity {
  id: string
  slug: string
  name: string
  description: string
  template: string
  cache_ttl_seconds: number
  is_active: boolean
  created_at: Date
  updated_at: Date
  render_mode: "text" | "html"
  html_template: string | null
  css: string | null
  theme: Record<string, string> | null
  is_public: boolean
  allowed_origins: string[]
  embed_width: string | null
  embed_height: string | null
}

interface VariableDbRow {
  id: string
  snippet_id: string
  placeholder_name: string
  mode: string
  source_table: string
  source_column: string
  aggregate_fn: string | null
  concat_separator: string | null
  concat_order_column: string | null
  concat_order_dir: string | null
  concat_limit: number | null
  filters: unknown
  fallback_value: string
  sort_order: number
}

function mapVariable(r: VariableDbRow): SnippetVariableRow {
  let filters: SnippetFilter[]
  try {
    filters = coerceFilters(r.filters)
  } catch {
    filters = []
  }
  return {
    id: r.id,
    snippet_id: r.snippet_id,
    placeholder_name: r.placeholder_name,
    mode: r.mode as SnippetVariableRow["mode"],
    source_table: r.source_table,
    source_column: r.source_column,
    aggregate_fn: r.aggregate_fn,
    concat_separator: r.concat_separator,
    concat_order_column: r.concat_order_column,
    concat_order_dir: r.concat_order_dir as SnippetVariableRow["concat_order_dir"],
    concat_limit: r.concat_limit,
    filters,
    fallback_value: r.fallback_value,
    sort_order: r.sort_order,
  }
}

export interface SnippetWithVariables extends SnippetEntity {
  variables: SnippetVariableRow[]
}

function mapSnippetRow(r: SnippetEntity & Record<string, unknown>): SnippetEntity {
  const themeRaw = r.theme
  let theme: Record<string, string> | null = null
  if (themeRaw != null && typeof themeRaw === "object" && !Array.isArray(themeRaw)) {
    theme = {}
    for (const [k, v] of Object.entries(themeRaw as Record<string, unknown>)) {
      theme[k] = v == null ? "" : String(v)
    }
  }
  const origins = r.allowed_origins
  const allowed_origins = Array.isArray(origins) ? origins.map(String) : []
  const rm = r.render_mode === "html" ? "html" : "text"
  return {
    ...r,
    render_mode: rm,
    theme,
    allowed_origins,
  }
}

@Injectable()
export class SnippetsRepository {
  constructor(@Inject("META_PG_POOL") private readonly pool: Pool) {}

  async findPublicSummaries(): Promise<Pick<SnippetEntity, "slug" | "name" | "is_active">[]> {
    const { rows } = await this.pool.query(
      `SELECT slug, name, is_active FROM snippets ORDER BY updated_at DESC`,
    )
    return rows as Pick<SnippetEntity, "slug" | "name" | "is_active">[]
  }

  async findAdminSummaries(): Promise<
    (Pick<SnippetEntity, "id" | "slug" | "name" | "description" | "is_active" | "updated_at"> & {
      variable_count: number
    })[]
  > {
    const { rows } = await this.pool.query(
      `SELECT s.id, s.slug, s.name, s.description, s.is_active, s.updated_at,
              COUNT(v.id)::int AS variable_count
       FROM snippets s
       LEFT JOIN snippet_variables v ON v.snippet_id = s.id
       GROUP BY s.id, s.slug, s.name, s.description, s.is_active, s.updated_at
       ORDER BY s.updated_at DESC`,
    )
    return rows as (Pick<SnippetEntity, "id" | "slug" | "name" | "description" | "is_active" | "updated_at"> & {
      variable_count: number
    })[]
  }

  async findBySlug(slug: string): Promise<SnippetWithVariables | null> {
    const { rows: srows } = await this.pool.query<SnippetEntity>(
      `SELECT * FROM snippets WHERE slug = $1`,
      [slug],
    )
    if (srows.length === 0) return null
    const snippet = mapSnippetRow(srows[0] as SnippetEntity & Record<string, unknown>)
    const { rows: vrows } = await this.pool.query<VariableDbRow>(
      `SELECT * FROM snippet_variables WHERE snippet_id = $1 ORDER BY sort_order, placeholder_name`,
      [snippet.id],
    )
    return { ...snippet, variables: vrows.map(mapVariable) }
  }

  async findById(id: string): Promise<SnippetWithVariables | null> {
    const { rows: srows } = await this.pool.query<SnippetEntity>(
      `SELECT * FROM snippets WHERE id = $1`,
      [id],
    )
    if (srows.length === 0) return null
    const snippet = mapSnippetRow(srows[0] as SnippetEntity & Record<string, unknown>)
    const { rows: vrows } = await this.pool.query<VariableDbRow>(
      `SELECT * FROM snippet_variables WHERE snippet_id = $1 ORDER BY sort_order, placeholder_name`,
      [id],
    )
    return { ...snippet, variables: vrows.map(mapVariable) }
  }

  async createSnippet(input: {
    slug: string
    name: string
    description: string
    template: string
    cache_ttl_seconds: number
    is_active: boolean
    render_mode?: "text" | "html"
    html_template?: string | null
    css?: string | null
    theme?: Record<string, string> | null
    is_public?: boolean
    allowed_origins?: string[]
    embed_width?: string | null
    embed_height?: string | null
  }): Promise<SnippetEntity> {
    const { rows } = await this.pool.query<SnippetEntity>(
      `INSERT INTO snippets (
        slug, name, description, template, cache_ttl_seconds, is_active,
        render_mode, html_template, css, theme, is_public, allowed_origins, embed_width, embed_height
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14)
       RETURNING *`,
      [
        input.slug,
        input.name,
        input.description,
        input.template,
        input.cache_ttl_seconds,
        input.is_active,
        input.render_mode ?? "text",
        input.html_template ?? null,
        input.css ?? null,
        input.theme ?? null,
        input.is_public ?? false,
        input.allowed_origins ?? [],
        input.embed_width ?? null,
        input.embed_height ?? null,
      ],
    )
    return mapSnippetRow(rows[0] as SnippetEntity & Record<string, unknown>)
  }

  async updateSnippet(
    id: string,
    input: Partial<{
      slug: string
      name: string
      description: string
      template: string
      cache_ttl_seconds: number
      is_active: boolean
      render_mode: "text" | "html"
      html_template: string | null
      css: string | null
      theme: Record<string, string> | null
      is_public: boolean
      allowed_origins: string[]
      embed_width: string | null
      embed_height: string | null
    }>,
  ): Promise<SnippetEntity | null> {
    const fields: string[] = []
    const values: unknown[] = []
    let i = 1
    const push = (name: string, v: unknown) => {
      fields.push(`${name} = $${i}`)
      values.push(v)
      i += 1
    }
    if (input.slug !== undefined) push("slug", input.slug)
    if (input.name !== undefined) push("name", input.name)
    if (input.description !== undefined) push("description", input.description)
    if (input.template !== undefined) push("template", input.template)
    if (input.cache_ttl_seconds !== undefined) push("cache_ttl_seconds", input.cache_ttl_seconds)
    if (input.is_active !== undefined) push("is_active", input.is_active)
    if (input.render_mode !== undefined) push("render_mode", input.render_mode)
    if (input.html_template !== undefined) push("html_template", input.html_template)
    if (input.css !== undefined) push("css", input.css)
    if (input.theme !== undefined) push("theme", input.theme)
    if (input.is_public !== undefined) push("is_public", input.is_public)
    if (input.allowed_origins !== undefined) push("allowed_origins", input.allowed_origins)
    if (input.embed_width !== undefined) push("embed_width", input.embed_width)
    if (input.embed_height !== undefined) push("embed_height", input.embed_height)
    if (fields.length === 0) {
      const { rows } = await this.pool.query<SnippetEntity>(`SELECT * FROM snippets WHERE id = $1`, [id])
      return rows[0] ? mapSnippetRow(rows[0] as SnippetEntity & Record<string, unknown>) : null
    }
    values.push(id)
    const { rows } = await this.pool.query<SnippetEntity>(
      `UPDATE snippets SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      values,
    )
    return rows[0] ? mapSnippetRow(rows[0] as SnippetEntity & Record<string, unknown>) : null
  }

  async deleteSnippet(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`DELETE FROM snippets WHERE id = $1`, [id])
    return (rowCount ?? 0) > 0
  }

  async duplicateSnippet(sourceId: string, newSlug: string): Promise<SnippetWithVariables | null> {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      const src = await this.findByIdWithClient(client, sourceId)
      if (!src) {
        await client.query("ROLLBACK")
        return null
      }
      const { rows } = await client.query<SnippetEntity>(
        `INSERT INTO snippets (
          slug, name, description, template, cache_ttl_seconds, is_active,
          render_mode, html_template, css, theme, is_public, allowed_origins, embed_width, embed_height
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14)
         RETURNING *`,
        [
          newSlug,
          `${src.name} (copy)`,
          src.description,
          src.template,
          src.cache_ttl_seconds,
          src.is_active,
          src.render_mode,
          src.html_template,
          src.css,
          src.theme,
          src.is_public,
          src.allowed_origins,
          src.embed_width,
          src.embed_height,
        ],
      )
      const newSnip = rows[0]!
      for (const v of src.variables) {
        await client.query(
          `INSERT INTO snippet_variables (
            snippet_id, placeholder_name, mode, source_table, source_column,
            aggregate_fn, concat_separator, concat_order_column, concat_order_dir,
            concat_limit, filters, fallback_value, sort_order
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
          [
            newSnip.id,
            v.placeholder_name,
            v.mode,
            v.source_table,
            v.source_column,
            v.aggregate_fn,
            v.concat_separator,
            v.concat_order_column,
            v.concat_order_dir,
            v.concat_limit,
            JSON.stringify(v.filters),
            v.fallback_value,
            v.sort_order,
          ],
        )
      }
      await client.query("COMMIT")
      return this.findById(newSnip.id)
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  private async findByIdWithClient(client: PoolClient, id: string): Promise<SnippetWithVariables | null> {
    const { rows: srows } = await client.query<SnippetEntity>(`SELECT * FROM snippets WHERE id = $1`, [id])
    if (srows.length === 0) return null
    const snippet = mapSnippetRow(srows[0] as SnippetEntity & Record<string, unknown>)
    const { rows: vrows } = await client.query<VariableDbRow>(
      `SELECT * FROM snippet_variables WHERE snippet_id = $1 ORDER BY sort_order, placeholder_name`,
      [id],
    )
    return { ...snippet, variables: vrows.map(mapVariable) }
  }

  async countVariables(snippetId: string): Promise<number> {
    const { rows } = await this.pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM snippet_variables WHERE snippet_id = $1`,
      [snippetId],
    )
    return Number.parseInt(rows[0]?.c ?? "0", 10)
  }

  async createVariable(
    snippetId: string,
    input: {
      placeholder_name: string
      mode: string
      source_table: string
      source_column: string
      aggregate_fn: string | null
      concat_separator: string | null
      concat_order_column: string | null
      concat_order_dir: string | null
      concat_limit: number | null
      filters: SnippetFilter[]
      fallback_value: string
      sort_order: number
    },
  ): Promise<SnippetVariableRow> {
    const { rows } = await this.pool.query<VariableDbRow>(
      `INSERT INTO snippet_variables (
        snippet_id, placeholder_name, mode, source_table, source_column,
        aggregate_fn, concat_separator, concat_order_column, concat_order_dir,
        concat_limit, filters, fallback_value, sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
      RETURNING *`,
      [
        snippetId,
        input.placeholder_name,
        input.mode,
        input.source_table,
        input.source_column,
        input.aggregate_fn,
        input.concat_separator,
        input.concat_order_column,
        input.concat_order_dir,
        input.concat_limit,
        JSON.stringify(input.filters),
        input.fallback_value,
        input.sort_order,
      ],
    )
    return mapVariable(rows[0]!)
  }

  async updateVariable(
    id: string,
    input: {
      placeholder_name: string
      mode: string
      source_table: string
      source_column: string
      aggregate_fn: string | null
      concat_separator: string | null
      concat_order_column: string | null
      concat_order_dir: string | null
      concat_limit: number | null
      filters: SnippetFilter[]
      fallback_value: string
      sort_order: number
    },
  ): Promise<SnippetVariableRow | null> {
    const { rows } = await this.pool.query<VariableDbRow>(
      `UPDATE snippet_variables SET
        placeholder_name = $2, mode = $3, source_table = $4, source_column = $5,
        aggregate_fn = $6, concat_separator = $7, concat_order_column = $8, concat_order_dir = $9,
        concat_limit = $10, filters = $11::jsonb, fallback_value = $12, sort_order = $13
      WHERE id = $1
      RETURNING *`,
      [
        id,
        input.placeholder_name,
        input.mode,
        input.source_table,
        input.source_column,
        input.aggregate_fn,
        input.concat_separator,
        input.concat_order_column,
        input.concat_order_dir,
        input.concat_limit,
        JSON.stringify(input.filters),
        input.fallback_value,
        input.sort_order,
      ],
    )
    return rows[0] ? mapVariable(rows[0]) : null
  }

  async deleteVariable(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`DELETE FROM snippet_variables WHERE id = $1`, [id])
    return (rowCount ?? 0) > 0
  }

  async getSnippetSlugByVariableId(variableId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ slug: string }>(
      `SELECT s.slug FROM snippets s
       JOIN snippet_variables v ON v.snippet_id = s.id
       WHERE v.id = $1`,
      [variableId],
    )
    return rows[0]?.slug ?? null
  }

  async findVariableIdBySnippetSlugAndPlaceholder(
    slug: string,
    placeholderName: string,
  ): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT v.id FROM snippet_variables v
       JOIN snippets s ON s.id = v.snippet_id
       WHERE s.slug = $1 AND v.placeholder_name = $2`,
      [slug, placeholderName],
    )
    return rows[0]?.id ?? null
  }

  async findVariableById(id: string): Promise<SnippetVariableRow | null> {
    const { rows } = await this.pool.query<VariableDbRow>(
      `SELECT * FROM snippet_variables WHERE id = $1`,
      [id],
    )
    return rows[0] ? mapVariable(rows[0]) : null
  }

  async findSnippetEntityById(id: string): Promise<SnippetEntity | null> {
    const { rows } = await this.pool.query<SnippetEntity>(
      `SELECT * FROM snippets WHERE id = $1`,
      [id],
    )
    return rows[0] ? mapSnippetRow(rows[0] as SnippetEntity & Record<string, unknown>) : null
  }
}
