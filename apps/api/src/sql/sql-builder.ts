import type {
  SnippetFilter,
  SnippetVariableRow,
  SqlBuildOk,
  SqlBuildResult,
} from "./sql-builder.types"

export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

function assertAllowedColumn(col: string, allowed: Set<string>): void {
  if (!allowed.has(col)) {
    throw new Error(`Column not allowed for table: ${col}`)
  }
}

function assertAllowedTable(table: string, allowedTable: string): void {
  if (table !== allowedTable) {
    throw new Error(`Table mismatch: ${table}`)
  }
}

function parseInList(literal: string): string[] {
  return literal
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

type ParamAnnot = { kind: "literal" | "context"; detail?: string }

export function buildFilterClauses(
  filters: SnippetFilter[],
  context: Record<string, string>,
  allowedColumns: Set<string>,
  quoteCol: (c: string) => string,
): { sql: string; params: unknown[]; annots: ParamAnnot[]; missingContextKey?: string } {
  const params: unknown[] = []
  const annots: ParamAnnot[] = []
  const sqlParts: string[] = []

  const pushParam = (v: unknown, ann: ParamAnnot): string => {
    params.push(v)
    annots.push(ann)
    return `$${params.length}`
  }

  for (const f of filters) {
    assertAllowedColumn(f.column, allowedColumns)
    const colSql = quoteCol(f.column)

    if (f.operator === "IS NULL" || f.operator === "IS NOT NULL") {
      sqlParts.push(`${colSql} ${f.operator}`)
      continue
    }

    if (f.value_type === "context") {
      const key = f.context_key?.trim()
      if (!key) {
        return { sql: "", params: [], annots: [], missingContextKey: "(empty context key)" }
      }
      if (!(key in context)) {
        return { sql: "", params: [], annots: [], missingContextKey: key }
      }
      const raw = context[key]!

      if (f.operator === "IN" || f.operator === "NOT IN") {
        const slot = pushParam(raw, { kind: "context", detail: key })
        sqlParts.push(
          `${colSql} ${f.operator} (SELECT trim(both from unnest(string_to_array(${slot}, ','))))`,
        )
        continue
      }

      const slot = pushParam(raw, { kind: "context", detail: key })
      sqlParts.push(`${colSql} ${f.operator} ${slot}`)
      continue
    }

    const lit = f.value ?? ""
    if (f.operator === "IN" || f.operator === "NOT IN") {
      const parts = parseInList(lit)
      if (parts.length === 0) {
        sqlParts.push(f.operator === "IN" ? "FALSE" : "TRUE")
        continue
      }
      const slots = parts.map((part) => pushParam(part, { kind: "literal" }))
      sqlParts.push(`${colSql} ${f.operator} (${slots.join(", ")})`)
      continue
    }

    const slot = pushParam(lit, { kind: "literal" })
    sqlParts.push(`${colSql} ${f.operator} ${slot}`)
  }

  const sql = sqlParts.length ? sqlParts.join(" AND ") : "TRUE"
  return { sql, params, annots }
}

function previewFrom(sql: string, annots: ParamAnnot[]): string {
  let i = 0
  return sql.replace(/\$\d+/g, () => {
    const ann = annots[i]
    i += 1
    if (!ann) return "$?"
    if (ann.kind === "context" && ann.detail) {
      return `$${i} /* context: ${ann.detail} */`
    }
    return `$${i} /* literal */`
  })
}

function buildConcatSql(
  variable: SnippetVariableRow,
  whereSql: string,
  whereParams: unknown[],
  whereAnnots: ParamAnnot[],
  allowedColumns: Set<string>,
): SqlBuildOk {
  const q = (c: string) => quoteIdent(c)
  const t = q(variable.source_table)
  const col = q(variable.source_column)
  const sep = variable.concat_separator ?? ""
  const orderCol = variable.concat_order_column
  const orderDir = variable.concat_order_dir ?? "ASC"
  const lim = variable.concat_limit

  if (orderCol) {
    assertAllowedColumn(orderCol, allowedColumns)
  }

  const params: unknown[] = [...whereParams]
  const annots: ParamAnnot[] = [...whereAnnots]

  const push = (v: unknown, a: ParamAnnot) => {
    params.push(v)
    annots.push(a)
    return `$${params.length}`
  }

  const sepPh = push(sep, { kind: "literal" })

  let inner = `SELECT ${col}`
  if (orderCol) {
    inner += `, ${q(orderCol)}`
  }
  inner += ` FROM ${t} WHERE ${whereSql}`
  if (orderCol) {
    inner += ` ORDER BY ${q(orderCol)} ${orderDir}`
  }
  if (lim != null && lim > 0) {
    inner += ` LIMIT ${push(lim, { kind: "literal" })}`
  }

  const outerSelect = orderCol
    ? `SELECT STRING_AGG(${col}, ${sepPh} ORDER BY ${q(orderCol)} ${orderDir}) AS v FROM (${inner}) AS sub`
    : `SELECT STRING_AGG(${col}, ${sepPh}) AS v FROM (${inner}) AS sub`

  return {
    sql: outerSelect,
    params,
    previewSql: previewFrom(outerSelect, annots),
  }
}

export function buildVariableSql(
  variable: SnippetVariableRow,
  context: Record<string, string>,
  allowedTable: string,
  allowedColumns: Set<string>,
): SqlBuildResult {
  assertAllowedTable(variable.source_table, allowedTable)

  const isCountStar =
    variable.mode === "aggregate" &&
    variable.aggregate_fn === "COUNT" &&
    variable.source_column === "*"

  if (!isCountStar) {
    assertAllowedColumn(variable.source_column, allowedColumns)
  }

  if (variable.concat_order_column) {
    assertAllowedColumn(variable.concat_order_column, allowedColumns)
  }

  const q = (c: string) => quoteIdent(c)
  const t = q(variable.source_table)

  const { sql: whereSql, params: whereParams, annots: whereAnnots, missingContextKey } =
    buildFilterClauses(variable.filters, context, allowedColumns, (c) => q(c))

  if (missingContextKey) {
    return { missingContextKey }
  }

  if (variable.mode === "scalar") {
    const sql = `SELECT ${q(variable.source_column)} AS v FROM ${t} WHERE ${whereSql} LIMIT 1`
    return {
      sql,
      params: [...whereParams],
      previewSql: previewFrom(sql, whereAnnots),
    }
  }

  if (variable.mode === "aggregate") {
    const fn = variable.aggregate_fn ?? "COUNT"
    const inner =
      fn === "COUNT" && variable.source_column === "*" ? "COUNT(*)" : `${fn}(${q(variable.source_column)})`
    const sql = `SELECT ${inner} AS v FROM ${t} WHERE ${whereSql}`
    return {
      sql,
      params: [...whereParams],
      previewSql: previewFrom(sql, whereAnnots),
    }
  }

  return buildConcatSql(variable, whereSql, whereParams, whereAnnots, allowedColumns)
}
