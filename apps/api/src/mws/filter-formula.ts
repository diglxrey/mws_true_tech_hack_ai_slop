import type { SnippetFilter } from "../sql/sql-builder.types"

function fieldRef(column: string): string {
  const safe = column.replaceAll("}", "").replaceAll("{", "")
  return `{${safe}}`
}

function escapeString(s: string): string {
  return s.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
}

function isNumericLike(s: string): boolean {
  if (s === "") return false
  const n = Number(s)
  return Number.isFinite(n) && String(n) === s.trim()
}

/** Single value for formula: quoted string or bare number */
function literalToken(raw: string): string {
  const t = raw.trim()
  if (isNumericLike(t)) return t
  return `"${escapeString(t)}"`
}

function contextValue(context: Record<string, string>, key: string): string | undefined {
  const v = context[key]
  return v !== undefined ? v : undefined
}

function parseInValues(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Build MWS/AITable-style filterByFormula (AND-combined).
 * Unsupported operators throw via { unsupported }.
 */
export type MwsFilterFormulaResult =
  | { ok: true; formula: string }
  | { ok: false; missingContextKey: string }
  | { ok: false; unsupported: string }
  | { ok: false; impossible: "empty_in" }

export function buildMwsFilterFormula(
  filters: SnippetFilter[],
  context: Record<string, string>,
  allowedColumns: Set<string>,
): MwsFilterFormulaResult {
  const parts: string[] = []

  for (const f of filters) {
    if (!allowedColumns.has(f.column)) {
      return { ok: false, unsupported: `Unknown column: ${f.column}` }
    }
    const col = fieldRef(f.column)

    if (f.operator === "LIKE") {
      return { ok: false, unsupported: "LIKE is not supported for MWS filterByFormula" }
    }

    if (f.operator === "IS NULL") {
      parts.push(`BLANK(${col})`)
      continue
    }
    if (f.operator === "IS NOT NULL") {
      parts.push(`NOT(BLANK(${col}))`)
      continue
    }

    let rhs: string
    if (f.value_type === "context") {
      const key = f.context_key?.trim()
      if (!key) return { ok: false, missingContextKey: "(empty context key)" }
      const cv = contextValue(context, key)
      if (cv === undefined) return { ok: false, missingContextKey: key }
      rhs = literalToken(cv)
    } else {
      const raw = f.value ?? ""
      if (f.operator === "IN" || f.operator === "NOT IN") {
        const vals = parseInValues(raw)
        if (vals.length === 0) {
          if (f.operator === "IN") {
            return { ok: false, impossible: "empty_in" as const }
          }
          /* NOT IN with empty list matches all — omit clause */
          continue
        }
        const ors = vals.map((v) => `${col}=${literalToken(v)}`)
        const inner = ors.length === 1 ? ors[0]! : `OR(${ors.join(",")})`
        if (f.operator === "IN") {
          parts.push(inner)
        } else {
          parts.push(`NOT(${inner})`)
        }
        continue
      }
      rhs = literalToken(raw)
    }

    switch (f.operator) {
      case "=":
        parts.push(`${col}=${rhs}`)
        break
      case "!=":
        parts.push(`${col}!=${rhs}`)
        break
      case ">":
        parts.push(`${col}>${rhs}`)
        break
      case "<":
        parts.push(`${col}<${rhs}`)
        break
      case ">=":
        parts.push(`${col}>=${rhs}`)
        break
      case "<=":
        parts.push(`${col}<=${rhs}`)
        break
      default:
        return { ok: false, unsupported: `Unsupported operator for MWS: ${f.operator}` }
    }
  }

  if (parts.length === 0) return { ok: true, formula: "" }
  if (parts.length === 1) return { ok: true, formula: parts[0]! }
  return { ok: true, formula: `AND(${parts.join(",")})` }
}
