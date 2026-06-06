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
  created_at: string
  updated_at: string
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
  created_at: string
  updated_at: string
}

export interface WikiVersionSummary {
  id: string
  page_id: string
  version_num: number
  label: string | null
  created_by: string
  created_at: string
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
  created_at: string
  updated_at: string
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

export interface WikiTag {
  id: string
  slug: string
  name: string
  created_at: string
}

export interface FusionNode {
  id: string
  name: string
  type: string
  children?: FusionNode[]
}

export interface FusionRecordsPage {
  pageNum: number
  pageSize: number
  total: number
  records: Array<{ recordId: string; fields: Record<string, unknown> }>
}

export type MwsFieldType =
  | "SingleText"
  | "Text"
  | "SingleSelect"
  | "MultiSelect"
  | "Number"
  | "Currency"
  | "Percent"
  | "DateTime"
  | "Attachment"
  | "Member"
  | "Checkbox"
  | "Rating"
  | "URL"
  | "Phone"
  | "Email"
  | "WorkDoc"
  | "OneWayLink"
  | "TwoWayLink"
  | "MagicLookUp"
  | "Formula"
  | "AutoNumber"
  | "CreatedTime"
  | "LastModifiedTime"
  | "CreatedBy"
  | "LastModifiedBy"
  | (string & {})

export interface FusionSelectOption {
  name?: string
  color?: string
}

export interface FusionFieldProperty {
  options?: FusionSelectOption[]
  defaultValue?: unknown
  icon?: string
  max?: number
  precision?: number
  symbol?: string
  symbolAlign?: "left" | "right" | string
  dateFormat?: string
  timeFormat?: string
  includeTime?: boolean
  isMulti?: boolean
  [key: string]: unknown
}

export interface FusionField {
  id: string
  name: string
  type: MwsFieldType
  desc?: string
  property?: FusionFieldProperty
}

export interface WikiInlineMwsSnippetBinding {
  dstId: string
  viewId?: string
  pkColumn: string
  pkValue: string
  valueColumn: string
  recordId?: string
}

export interface WikiInlineMwsSnippetValue {
  found: boolean
  record_id: string | null
  value: unknown
  fetched_at: string
}

export type WikiMwsAggregationKind = "count" | "median" | "min" | "max" | "avg" | "mode"

export interface WikiInlineMwsAggregateBinding {
  dstId: string
  viewId?: string
  column?: string
  kind: WikiMwsAggregationKind
  filterByFormula?: string
}

export interface WikiInlineMwsAggregateValue {
  kind: WikiMwsAggregationKind
  column: string | null
  value: number | string | null
  sampled_count: number
  truncated: boolean
  fetched_at: string
}
