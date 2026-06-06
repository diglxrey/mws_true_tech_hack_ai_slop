import { describe, expect, it } from "vitest"
import { buildMwsFilterFormula } from "./filter-formula"
import type { SnippetFilter } from "../sql/sql-builder.types"

const cols = new Set(["Title", "Amount", "Status"])

describe("buildMwsFilterFormula", () => {
  it("builds AND for multiple filters", () => {
    const filters: SnippetFilter[] = [
      { column: "Title", operator: "=", value_type: "literal", value: "x" },
      { column: "Amount", operator: ">", value_type: "literal", value: "1" },
    ]
    const r = buildMwsFilterFormula(filters, {}, cols)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.formula).toContain("AND(")
      expect(r.formula).toContain('{Title}="x"')
      expect(r.formula).toContain("{Amount}>1")
    }
  })

  it("returns missing context key", () => {
    const filters: SnippetFilter[] = [
      { column: "Title", operator: "=", value_type: "context", context_key: "k" },
    ]
    const r = buildMwsFilterFormula(filters, {}, cols)
    expect(r.ok).toBe(false)
    if (!r.ok && "missingContextKey" in r) {
      expect(r.missingContextKey).toBe("k")
    }
  })

  it("expands IN literal as OR", () => {
    const filters: SnippetFilter[] = [
      { column: "Status", operator: "IN", value_type: "literal", value: "a, b" },
    ]
    const r = buildMwsFilterFormula(filters, {}, cols)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.formula).toContain("OR(")
    }
  })

  it("empty IN is impossible", () => {
    const filters: SnippetFilter[] = [
      { column: "Status", operator: "IN", value_type: "literal", value: "  ,  " },
    ]
    const r = buildMwsFilterFormula(filters, {}, cols)
    expect(r.ok).toBe(false)
    if (!r.ok && "impossible" in r) {
      expect(r.impossible).toBe("empty_in")
    }
  })

  it("rejects LIKE", () => {
    const filters: SnippetFilter[] = [
      { column: "Title", operator: "LIKE", value_type: "literal", value: "%" },
    ]
    const r = buildMwsFilterFormula(filters, {}, cols)
    expect(r.ok).toBe(false)
    if (!r.ok && "unsupported" in r) {
      expect(r.unsupported).toContain("LIKE")
    }
  })

  it("IS NULL uses BLANK", () => {
    const filters: SnippetFilter[] = [
      { column: "Title", operator: "IS NULL", value_type: "literal" },
    ]
    const r = buildMwsFilterFormula(filters, {}, cols)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.formula).toBe("BLANK({Title})")
    }
  })
})
