import { describe, expect, it } from "vitest"
import { buildVariableSql, quoteIdent } from "./sql-builder"
import type { SnippetVariableRow } from "./sql-builder.types"
import { isSqlBuildOk } from "./sql-builder.types"

const baseVar = (over: Partial<SnippetVariableRow>): SnippetVariableRow => ({
  id: "1",
  snippet_id: "s",
  placeholder_name: "x",
  mode: "scalar",
  source_table: "orders",
  source_column: "amount",
  aggregate_fn: null,
  concat_separator: null,
  concat_order_column: null,
  concat_order_dir: null,
  concat_limit: null,
  filters: [],
  fallback_value: "0",
  sort_order: 0,
  ...over,
})

const cols = new Set(["amount", "status", "user_id", "name"])

describe("quoteIdent", () => {
  it("quotes and escapes", () => {
    expect(quoteIdent(`a"b`)).toBe(`"a""b"`)
  })
})

describe("buildVariableSql", () => {
  it("scalar with literal filter", () => {
    const v = baseVar({
      filters: [
        { column: "status", operator: "=", value_type: "literal", value: "completed" },
      ],
    })
    const r = buildVariableSql(v, {}, "orders", cols)
    expect(isSqlBuildOk(r)).toBe(true)
    if (!isSqlBuildOk(r)) return
    expect(r.sql).toContain("LIMIT 1")
    expect(r.params).toEqual(["completed"])
  })

  it("aggregate COUNT(*)", () => {
    const v = baseVar({
      mode: "aggregate",
      aggregate_fn: "COUNT",
      source_column: "*",
    })
    const r = buildVariableSql(v, {}, "orders", new Set(["amount", "status"]))
    expect(isSqlBuildOk(r)).toBe(true)
    if (!isSqlBuildOk(r)) return
    expect(r.sql).toContain("COUNT(*)")
  })

  it("returns missing context key", () => {
    const v = baseVar({
      filters: [
        {
          column: "user_id",
          operator: "=",
          value_type: "context",
          context_key: "user_id",
        },
      ],
    })
    const r = buildVariableSql(v, {}, "orders", cols)
    expect(isSqlBuildOk(r)).toBe(false)
    if (isSqlBuildOk(r)) return
    expect(r.missingContextKey).toBe("user_id")
  })

  it("concat with separator param", () => {
    const v = baseVar({
      mode: "concat",
      source_column: "name",
      concat_separator: ", ",
      concat_limit: 3,
    })
    const r = buildVariableSql(v, {}, "orders", new Set(["name"]))
    expect(isSqlBuildOk(r)).toBe(true)
    if (!isSqlBuildOk(r)) return
    expect(r.sql).toContain("STRING_AGG")
    expect(r.params).toContain(", ")
    expect(r.params).toContain(3)
  })
})
