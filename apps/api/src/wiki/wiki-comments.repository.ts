import { Inject, Injectable } from "@nestjs/common"
import type { Pool } from "pg"
import type { CreateCommentDto, UpdateCommentDto, WikiComment } from "./wiki.types"

@Injectable()
export class WikiCommentsRepository {
  constructor(@Inject("META_PG_POOL") private readonly pool: Pool) {}

  async findByPage(pageId: string): Promise<WikiComment[]> {
    const { rows } = await this.pool.query<WikiComment>(
      `SELECT id, page_id, block_id, range_start, range_end, author, body, resolved, parent_id, created_at, updated_at
       FROM wiki_comments
       WHERE page_id = $1
       ORDER BY created_at ASC`,
      [pageId],
    )
    return rows
  }

  async create(pageId: string, dto: CreateCommentDto): Promise<WikiComment> {
    const { rows } = await this.pool.query<WikiComment>(
      `INSERT INTO wiki_comments (page_id, block_id, body, author, range_start, range_end, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, page_id, block_id, range_start, range_end, author, body, resolved, parent_id, created_at, updated_at`,
      [
        pageId,
        dto.block_id ?? "page", // Default to "page" if not provided
        dto.body,
        dto.author ?? "anonymous",
        dto.range_start ?? null,
        dto.range_end ?? null,
        dto.parent_id ?? null,
      ],
    )
    return rows[0]!
  }

  async update(commentId: string, dto: UpdateCommentDto): Promise<WikiComment | null> {
    const sets: string[] = []
    const vals: unknown[] = []
    let idx = 1

    if (dto.body !== undefined) { sets.push(`body = $${idx++}`); vals.push(dto.body) }
    if (dto.resolved !== undefined) { sets.push(`resolved = $${idx++}`); vals.push(dto.resolved) }

    if (sets.length === 0) {
      const { rows } = await this.pool.query<WikiComment>(
        `SELECT id, page_id, block_id, range_start, range_end, author, body, resolved, parent_id, created_at, updated_at
         FROM wiki_comments WHERE id = $1`,
        [commentId],
      )
      return rows[0] ?? null
    }

    vals.push(commentId)
    const { rows } = await this.pool.query<WikiComment>(
      `UPDATE wiki_comments SET ${sets.join(", ")} WHERE id = $${idx}
       RETURNING id, page_id, block_id, range_start, range_end, author, body, resolved, parent_id, created_at, updated_at`,
      vals,
    )
    return rows[0] ?? null
  }

  async delete(commentId: string): Promise<void> {
    await this.pool.query(`DELETE FROM wiki_comments WHERE id = $1`, [commentId])
  }
}
