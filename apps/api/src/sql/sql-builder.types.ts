export type FilterOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "IN"
  | "NOT IN"
  | "IS NULL"
  | "IS NOT NULL"
  | "LIKE"

export type ValueType = "literal" | "context"

export interface SnippetFilter {
  column: string
  operator: FilterOperator
  value_type: ValueType
  value?: string | null
  context_key?: string | null
}

export type VariableMode = "scalar" | "aggregate" | "concat"

export interface SnippetVariableRow {
  id: string
  snippet_id: string
  placeholder_name: string
  mode: VariableMode
  source_table: string
  source_column: string
  aggregate_fn: string | null
  concat_separator: string | null
  concat_order_column: string | null
  concat_order_dir: "ASC" | "DESC" | null
  concat_limit: number | null
  filters: SnippetFilter[]
  fallback_value: string
  sort_order: number
}

export interface SqlBuildOk {
  sql: string
  params: unknown[]
  previewSql: string
}

export interface SqlBuildErr {
  missingContextKey: string
}

export type SqlBuildResult = SqlBuildOk | SqlBuildErr

export function isSqlBuildOk(r: SqlBuildResult): r is SqlBuildOk {
  return "sql" in r && typeof (r as SqlBuildOk).sql === "string"
}
