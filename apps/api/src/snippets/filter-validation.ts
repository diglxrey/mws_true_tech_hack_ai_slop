import { BadRequestException } from "@nestjs/common"
import type { FilterOperator, SnippetFilter, ValueType } from "../sql/sql-builder.types"

const OPERATORS: ReadonlySet<FilterOperator> = new Set([
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "IN",
  "NOT IN",
  "IS NULL",
  "IS NOT NULL",
  "LIKE",
])

const VALUE_TYPES: ReadonlySet<ValueType> = new Set(["literal", "context"])

export function coerceFilters(raw: unknown, max = 20): SnippetFilter[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) {
    throw new BadRequestException("filters must be an array")
  }
  if (raw.length > max) {
    throw new BadRequestException(`At most ${max} filters allowed`)
  }
  const out: SnippetFilter[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      throw new BadRequestException("Invalid filter entry")
    }
    const o = item as Record<string, unknown>
    const column = o["column"]
    const operator = o["operator"]
    const value_type = o["value_type"]
    if (typeof column !== "string" || !column.trim()) {
      throw new BadRequestException("Filter column is required")
    }
    if (typeof operator !== "string" || !OPERATORS.has(operator as FilterOperator)) {
      throw new BadRequestException("Invalid filter operator")
    }
    if (typeof value_type !== "string" || !VALUE_TYPES.has(value_type as ValueType)) {
      throw new BadRequestException("Invalid filter value_type")
    }
    const op = operator as FilterOperator
    const vt = value_type as ValueType
    const filter: SnippetFilter = {
      column: column.trim(),
      operator: op,
      value_type: vt,
      value: o["value"] == null ? null : String(o["value"]),
      context_key: o["context_key"] == null ? null : String(o["context_key"]),
    }
    if (op === "IS NULL" || op === "IS NOT NULL") {
      out.push({ ...filter, value: null, context_key: null })
      continue
    }
    if (vt === "literal") {
      out.push(filter)
      continue
    }
    const ck = filter.context_key?.trim()
    if (!ck) {
      throw new BadRequestException("context_key required for context filter")
    }
    out.push({ ...filter, context_key: ck })
  }
  return out
}
