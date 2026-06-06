import { Inject, Injectable } from "@nestjs/common"
import type { Pool } from "pg"
import * as Y from "yjs"
import type { CreatePageDto, UpdatePageDto, WikiPageRow, WikiTagRow } from "./wiki.types"

const MAX_SNAPSHOTS_PER_PAGE = 5

@Injectable()
export class WikiPagesRepository {
  constructor(@Inject("META_PG_POOL") private readonly pool: Pool) {}

  async findAll(): Promise<WikiPageRow[]> {
    const { rows } = await this.pool.query<WikiPageRow>(
      `SELECT id, slug, title, parent_id, icon, cover_url, is_deleted, created_by, updated_by, created_at, updated_at
       FROM wiki_pages
       WHERE is_deleted = false
       ORDER BY created_at ASC`,
    )
    return rows
  }

  async findById(id: string): Promise<WikiPageRow | null> {
    const { rows } = await this.pool.query<WikiPageRow>(
      `SELECT id, slug, title, parent_id, icon, cover_url, is_deleted, created_by, updated_by, created_at, updated_at
       FROM wiki_pages WHERE id = $1 AND is_deleted = false`,
      [id],
    )
    return rows[0] ?? null
  }

  async findBySlug(slug: string): Promise<WikiPageRow | null> {
    const { rows } = await this.pool.query<WikiPageRow>(
      `SELECT id, slug, title, parent_id, icon, cover_url, is_deleted, created_by, updated_by, created_at, updated_at
       FROM wiki_pages WHERE slug = $1 AND is_deleted = false`,
      [slug],
    )
    return rows[0] ?? null
  }

  async findByTitlesOrSlugs(terms: string[]): Promise<Array<Pick<WikiPageRow, "id" | "slug" | "title">>> {
    if (terms.length === 0) return []
    const normalized = [...new Set(terms.map((term) => term.trim()).filter(Boolean))]
    if (normalized.length === 0) return []

    const { rows } = await this.pool.query<Pick<WikiPageRow, "id" | "slug" | "title">>(
      `SELECT id, slug, title
       FROM wiki_pages
       WHERE is_deleted = false
         AND (lower(title) = ANY($1::text[]) OR lower(slug) = ANY($1::text[]))`,
      [normalized.map((term) => term.toLowerCase())],
    )
    return rows
  }

  async create(dto: CreatePageDto & { created_by?: string }): Promise<WikiPageRow> {
    const { rows } = await this.pool.query<WikiPageRow>(
      `INSERT INTO wiki_pages (slug, title, parent_id, icon, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING id, slug, title, parent_id, icon, cover_url, is_deleted, created_by, updated_by, created_at, updated_at`,
      [dto.slug, dto.title ?? "Untitled", dto.parent_id ?? null, dto.icon ?? null, dto.created_by ?? "system"],
    )
    const page = rows[0]!

    // Create an empty initial snapshot so versions can be created immediately
    try {
      const emptyYdoc = new Y.Doc()
      const emptyState = Buffer.from(Y.encodeStateAsUpdate(emptyYdoc))
      await this.saveSnapshot(page.id, emptyState)
    } catch {
      // If snapshot creation fails, page is still created successfully
    }

    return page
  }

  async update(id: string, dto: UpdatePageDto): Promise<WikiPageRow | null> {
    const sets: string[] = []
    const vals: unknown[] = []
    let idx = 1

    if (dto.title !== undefined) { sets.push(`title = $${idx++}`); vals.push(dto.title) }
    if ("parent_id" in dto) { sets.push(`parent_id = $${idx++}`); vals.push(dto.parent_id ?? null) }
    if ("icon" in dto) { sets.push(`icon = $${idx++}`); vals.push(dto.icon ?? null) }
    if ("cover_url" in dto) { sets.push(`cover_url = $${idx++}`); vals.push(dto.cover_url ?? null) }
    if (dto.updated_by) { sets.push(`updated_by = $${idx++}`); vals.push(dto.updated_by) }

    if (sets.length === 0) return this.findById(id)

    vals.push(id)
    const { rows } = await this.pool.query<WikiPageRow>(
      `UPDATE wiki_pages SET ${sets.join(", ")} WHERE id = $${idx} AND is_deleted = false
       RETURNING id, slug, title, parent_id, icon, cover_url, is_deleted, created_by, updated_by, created_at, updated_at`,
      vals,
    )
    return rows[0] ?? null
  }

  async softDelete(id: string): Promise<void> {
    await this.pool.query(`UPDATE wiki_pages SET is_deleted = true WHERE id = $1`, [id])
  }

  async saveSnapshot(pageId: string, state: Buffer): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        `INSERT INTO wiki_page_snapshots (page_id, ydoc_state) VALUES ($1, $2)`,
        [pageId, state],
      )
      // Keep only the most recent MAX_SNAPSHOTS_PER_PAGE snapshots
      await client.query(
        `DELETE FROM wiki_page_snapshots
         WHERE page_id = $1
           AND id NOT IN (
             SELECT id FROM wiki_page_snapshots
             WHERE page_id = $1
             ORDER BY saved_at DESC
             LIMIT $2
           )`,
        [pageId, MAX_SNAPSHOTS_PER_PAGE],
      )
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async loadSnapshot(pageId: string): Promise<Buffer | null> {
    const { rows } = await this.pool.query<{ ydoc_state: Buffer }>(
      `SELECT ydoc_state FROM wiki_page_snapshots
       WHERE page_id = $1
       ORDER BY saved_at DESC LIMIT 1`,
      [pageId],
    )
    return rows[0]?.ydoc_state ?? null
  }

  async findBacklinks(pageId: string): Promise<WikiPageRow[]> {
    const { rows } = await this.pool.query<WikiPageRow>(
      `SELECT p.id, p.slug, p.title, p.parent_id, p.icon, p.cover_url, p.is_deleted,
              p.created_by, p.updated_by, p.created_at, p.updated_at
       FROM wiki_pages p
       JOIN wiki_page_links l ON l.source_id = p.id
       WHERE l.target_id = $1 AND p.is_deleted = false`,
      [pageId],
    )
    return rows
  }

  async replaceLinks(sourceId: string, targetIds: string[]): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(`DELETE FROM wiki_page_links WHERE source_id = $1`, [sourceId])
      if (targetIds.length > 0) {
        const placeholders = targetIds.map((_, i) => `($1, $${i + 2})`).join(", ")
        await client.query(
          `INSERT INTO wiki_page_links (source_id, target_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
          [sourceId, ...targetIds],
        )
      }
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async listTags(query?: string): Promise<WikiTagRow[]> {
    if (!query?.trim()) {
      const { rows } = await this.pool.query<WikiTagRow>(
        `SELECT id, slug, name, created_at
         FROM wiki_tags
         ORDER BY name ASC
         LIMIT 50`,
      )
      return rows
    }

    const q = `%${query.trim().toLowerCase()}%`
    const { rows } = await this.pool.query<WikiTagRow>(
      `SELECT id, slug, name, created_at
       FROM wiki_tags
       WHERE lower(name) LIKE $1 OR lower(slug) LIKE $1
       ORDER BY name ASC
       LIMIT 50`,
      [q],
    )
    return rows
  }

  async upsertTag(name: string): Promise<WikiTagRow> {
    const normalizedName = name.trim().replace(/\s+/g, " ")
    const baseSlug =
      normalizedName
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "") || "tag"

    const existingByName = await this.pool.query<WikiTagRow>(
      `SELECT id, slug, name, created_at
       FROM wiki_tags
       WHERE lower(name) = lower($1)
       LIMIT 1`,
      [normalizedName],
    )
    if (existingByName.rows[0]) return existingByName.rows[0]

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`
      try {
        const { rows } = await this.pool.query<WikiTagRow>(
          `INSERT INTO wiki_tags (slug, name)
           VALUES ($1, $2)
           RETURNING id, slug, name, created_at`,
          [candidateSlug, normalizedName],
        )
        return rows[0]!
      } catch (e: unknown) {
        const err = e as { code?: string }
        if (err.code !== "23505") {
          throw e
        }
      }
    }

    throw new Error("failed to create a unique wiki tag slug")
  }

  async upsertTags(names: string[]): Promise<WikiTagRow[]> {
    const cleaned = [...new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean))]
    if (cleaned.length === 0) return []
    const tags: WikiTagRow[] = []
    for (const tag of cleaned) {
      tags.push(await this.upsertTag(tag))
    }
    return tags
  }

  async replacePageTags(pageId: string, tagIds: string[]): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(`DELETE FROM wiki_page_tags WHERE page_id = $1`, [pageId])
      if (tagIds.length > 0) {
        const placeholders = tagIds.map((_, i) => `($1, $${i + 2})`).join(", ")
        await client.query(
          `INSERT INTO wiki_page_tags (page_id, tag_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
          [pageId, ...tagIds],
        )
      }
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }
}
