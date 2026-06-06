// Shared types for the wiki module

export interface WikiPageRow {
  id: string
  slug: string
  title: string
  parent_id: string | null
  icon: string | null
  cover_url: string | null
  is_deleted: boolean
  created_by: string
  updated_by: string
  created_at: Date
  updated_at: Date
}

export interface WikiComment {
  id: string
  page_id: string
  block_id: string
  range_start: number | null
  range_end: number | null
  author: string
  body: string
  resolved: boolean
  parent_id: string | null
  created_at: Date
  updated_at: Date
}

export interface WikiVersionSummary {
  id: string
  page_id: string
  version_num: number
  label: string | null
  created_by: string
  created_at: Date
}

export interface WikiVersionFull extends WikiVersionSummary {
  ydoc_state_b64: string
}

export interface WikiMwsBlockConfig {
  id: string
  page_id: string
  block_id: string
  dst_id: string
  view_id: string | null
  filter_by_formula: string | null
  page_size: number
  refresh_interval_secs: number
  allow_edit_back: boolean
  created_at: Date
  updated_at: Date
}

export interface WikiGraphNode {
  id: string
  slug: string
  title: string
  size: number
  kind?: "page" | "tag"
}

export interface WikiGraphData {
  nodes: WikiGraphNode[]
  links: Array<{ source: string; target: string; kind?: "page-link" | "tag-link" }>
}

export interface WikiTagRow {
  id: string
  slug: string
  name: string
  created_at: Date
}

// DTOs

export interface CreatePageDto {
  slug: string
  title?: string
  parent_id?: string
  icon?: string
}

export interface UpdatePageDto {
  title?: string
  parent_id?: string | null
  icon?: string | null
  cover_url?: string | null
  updated_by?: string
}

export interface CreateCommentDto {
  block_id?: string // Optional: defaults to "page" if not provided
  body: string
  author?: string
  range_start?: number
  range_end?: number
  parent_id?: string
}

export interface UpdateCommentDto {
  body?: string
  resolved?: boolean
}

export interface CreateVersionDto {
  label?: string
  created_by?: string
}

export interface UpsertMwsBlockConfigDto {
  dst_id: string
  view_id?: string
  filter_by_formula?: string
  page_size?: number
  refresh_interval_secs?: number
  allow_edit_back?: boolean
}

export interface ResolveMwsSnippetValueDto {
  pk_column: string
  pk_value: string
  value_column: string
  view_id?: string
}

export interface ResolveMwsSnippetValueResult {
  found: boolean
  record_id: string | null
  value: unknown
  fetched_at: string
}

export type WikiMwsAggregationKind = "count" | "median" | "min" | "max" | "avg" | "mode"

export interface ResolveMwsAggregateDto {
  kind: WikiMwsAggregationKind
  column?: string
  view_id?: string
  filter_by_formula?: string
}

export interface ResolveMwsAggregateResult {
  kind: WikiMwsAggregationKind
  column: string | null
  value: number | string | null
  sampled_count: number
  truncated: boolean
  fetched_at: string
}
