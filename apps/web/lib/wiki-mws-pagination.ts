/** Match apps/api/src/wiki/wiki-mws-pagination.util.ts for legacy block props. */
export const WIKI_MWS_PAGE_SIZES = [10, 20, 50] as const
export type WikiMwsPageSize = (typeof WIKI_MWS_PAGE_SIZES)[number]

export function normalizeWikiMwsPageSize(raw: number): WikiMwsPageSize {
  if (raw === 10 || raw === 20 || raw === 50) return raw
  if (!Number.isFinite(raw) || Number.isNaN(raw)) return 50
  return WIKI_MWS_PAGE_SIZES.reduce<WikiMwsPageSize>(
    (best, n) => (Math.abs(n - raw) < Math.abs(best - raw) ? n : best),
    50,
  )
}
