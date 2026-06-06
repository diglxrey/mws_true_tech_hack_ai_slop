import { Inject, Injectable } from "@nestjs/common"
import type { Pool } from "pg"
import type { WikiGraphData } from "./wiki.types"

@Injectable()
export class WikiGraphService {
  constructor(@Inject("META_PG_POOL") private readonly pool: Pool) {}

  async getFullGraph(): Promise<WikiGraphData> {
    const { rows: pages } = await this.pool.query<{ id: string; slug: string; title: string }>(
      `SELECT id, slug, title FROM wiki_pages WHERE is_deleted = false`,
    )
    const { rows: links } = await this.pool.query<{ source_id: string; target_id: string }>(
      `SELECT l.source_id, l.target_id
       FROM wiki_page_links l
       JOIN wiki_pages s ON s.id = l.source_id AND s.is_deleted = false
       JOIN wiki_pages t ON t.id = l.target_id AND t.is_deleted = false`,
    )
    const { rows: tagRows } = await this.pool.query<{ tag_id: string; tag_slug: string; tag_name: string; page_id: string }>(
      `SELECT t.id AS tag_id, t.slug AS tag_slug, t.name AS tag_name, pt.page_id
       FROM wiki_page_tags pt
       JOIN wiki_tags t ON t.id = pt.tag_id
       JOIN wiki_pages p ON p.id = pt.page_id AND p.is_deleted = false`,
    )

    // Compute size = number of backlinks (in-links)
    const backlinkCount = new Map<string, number>()
    for (const { target_id } of links) {
      backlinkCount.set(target_id, (backlinkCount.get(target_id) ?? 0) + 1)
    }
    const tagUsage = new Map<string, number>()
    for (const row of tagRows) {
      tagUsage.set(row.tag_id, (tagUsage.get(row.tag_id) ?? 0) + 1)
    }

    const tagNodes = new Map<string, { id: string; slug: string; title: string; size: number; kind: "tag" }>()
    for (const row of tagRows) {
      if (!tagNodes.has(row.tag_id)) {
        tagNodes.set(row.tag_id, {
          id: row.tag_id,
          slug: row.tag_slug,
          title: `#${row.tag_name}`,
          size: tagUsage.get(row.tag_id) ?? 1,
          kind: "tag",
        })
      }
    }

    return {
      nodes: [
        ...pages.map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          size: backlinkCount.get(p.id) ?? 1,
          kind: "page" as const,
        })),
        ...tagNodes.values(),
      ],
      links: [
        ...links.map((l) => ({ source: l.source_id, target: l.target_id, kind: "page-link" as const })),
        ...tagRows.map((row) => ({ source: row.page_id, target: row.tag_id, kind: "tag-link" as const })),
      ],
    }
  }

  async getEgoGraph(pageId: string): Promise<WikiGraphData> {
    const { rows: links } = await this.pool.query<{ source_id: string; target_id: string }>(
      `SELECT source_id, target_id FROM wiki_page_links
       WHERE source_id = $1 OR target_id = $1`,
      [pageId],
    )
    const { rows: pageTags } = await this.pool.query<{ page_id: string; tag_id: string; tag_name: string; tag_slug: string }>(
      `SELECT pt.page_id, t.id AS tag_id, t.name AS tag_name, t.slug AS tag_slug
       FROM wiki_page_tags pt
       JOIN wiki_tags t ON t.id = pt.tag_id
       WHERE pt.page_id = $1`,
      [pageId],
    )

    const ids = new Set<string>([pageId])
    for (const l of links) { ids.add(l.source_id); ids.add(l.target_id) }

    const idList = [...ids]
    const placeholders = idList.map((_, i) => `$${i + 1}`).join(", ")
    const { rows: pages } = await this.pool.query<{ id: string; slug: string; title: string }>(
      `SELECT id, slug, title FROM wiki_pages WHERE id IN (${placeholders}) AND is_deleted = false`,
      idList,
    )

    const tagNodes = pageTags.map((tag) => ({
      id: tag.tag_id,
      slug: tag.tag_slug,
      title: `#${tag.tag_name}`,
      size: 1,
      kind: "tag" as const,
    }))
    return {
      nodes: [
        ...pages.map((p) => ({ id: p.id, slug: p.slug, title: p.title, size: 1, kind: "page" as const })),
        ...tagNodes,
      ],
      links: [
        ...links.map((l) => ({ source: l.source_id, target: l.target_id, kind: "page-link" as const })),
        ...pageTags.map((tag) => ({ source: tag.page_id, target: tag.tag_id, kind: "tag-link" as const })),
      ],
    }
  }
}
