import type { FusionClientService } from "./fusion-client.service"
import type { FusionRecord } from "./fusion.types"

const DEFAULT_PAGE = 500

export interface FetchCappedResult {
  records: FusionRecord[]
  total: number
  truncated: boolean
}

/**
 * Load records up to `cap` rows (for in-memory aggregate/concat).
 */
export async function fetchRecordsCapped(
  fusion: FusionClientService,
  dstId: string,
  opts: {
    filterByFormula?: string
    sort?: { field: string; order: "asc" | "desc" }[]
  },
  cap: number,
): Promise<FetchCappedResult> {
  const records: FusionRecord[] = []
  let total = 0
  let pageNum = 1
  let truncated = false

  while (records.length < cap) {
    const pageSize = Math.min(DEFAULT_PAGE, cap - records.length)
    const page = await fusion.getRecords(dstId, {
      ...opts,
      pageNum,
      pageSize,
      maxRecords: cap,
      cellFormat: "string",
      fieldKey: "name",
    })
    total = page.total
    if (page.records.length === 0) break
    for (const r of page.records) {
      records.push(r)
      if (records.length >= cap) break
    }
    if (records.length >= cap) break
    if (page.records.length < pageSize) break
    pageNum += 1
  }

  truncated = total > records.length

  return { records, total, truncated }
}
