/** Allowed page sizes for wiki MWS table → Fusion GET records. */
export const WIKI_MWS_PAGE_SIZES = [10, 20, 50] as const
export type WikiMwsPageSize = (typeof WIKI_MWS_PAGE_SIZES)[number]

const DEFAULT_PAGE_SIZE: WikiMwsPageSize = 50

export function normalizeWikiMwsPageSize(raw: number | undefined): WikiMwsPageSize {
  if (raw === 10 || raw === 20 || raw === 50) return raw
  if (raw === undefined || Number.isNaN(raw)) return DEFAULT_PAGE_SIZE
  return WIKI_MWS_PAGE_SIZES.reduce<WikiMwsPageSize>((best, n) =>
    Math.abs(n - raw) < Math.abs(best - raw) ? n : best,
  DEFAULT_PAGE_SIZE)
}

export function normalizeWikiMwsPageNum(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return 1
  const n = Math.floor(raw)
  return n >= 1 ? n : 1
}
