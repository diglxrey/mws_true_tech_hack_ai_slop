import { Inject, Injectable } from "@nestjs/common"
import type { Pool } from "pg"
import type { WikiVersionFull, WikiVersionSummary } from "./wiki.types"

@Injectable()
export class WikiVersionsRepository {
  constructor(@Inject("META_PG_POOL") private readonly pool: Pool) {}

  async findByPage(pageId: string): Promise<WikiVersionSummary[]> {
    const { rows } = await this.pool.query<WikiVersionSummary>(
      `SELECT id, page_id, version_num, label, created_by, created_at
       FROM wiki_page_versions
       WHERE page_id = $1
       ORDER BY version_num DESC`,
      [pageId],
    )
    return rows
  }

  async findById(versionId: string): Promise<WikiVersionFull | null> {
    const { rows } = await this.pool.query<{ id: string; page_id: string; version_num: number; label: string | null; created_by: string; created_at: Date; ydoc_state: Buffer }>(
      `SELECT id, page_id, version_num, label, created_by, created_at, ydoc_state
       FROM wiki_page_versions WHERE id = $1`,
      [versionId],
    )
    if (!rows[0]) return null
    const r = rows[0]
    return {
      id: r.id,
      page_id: r.page_id,
      version_num: r.version_num,
      label: r.label,
      created_by: r.created_by,
      created_at: r.created_at,
      ydoc_state_b64: r.ydoc_state.toString("base64"),
    }
  }

  async create(pageId: string, state: Buffer, label?: string, createdBy?: string): Promise<WikiVersionSummary> {
    const { rows: numRows } = await this.pool.query<{ next_num: number }>(
      `SELECT COALESCE(MAX(version_num), 0) + 1 AS next_num FROM wiki_page_versions WHERE page_id = $1`,
      [pageId],
    )
    const nextNum = numRows[0]?.next_num ?? 1
    const { rows } = await this.pool.query<WikiVersionSummary>(
      `INSERT INTO wiki_page_versions (page_id, version_num, label, ydoc_state, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, page_id, version_num, label, created_by, created_at`,
      [pageId, nextNum, label ?? null, state, createdBy ?? "system"],
    )
    return rows[0]!
  }
}
