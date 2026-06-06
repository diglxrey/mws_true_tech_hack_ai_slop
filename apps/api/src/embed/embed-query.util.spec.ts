import { describe, expect, it } from "vitest"
import { splitEmbedQuery } from "./embed-query.util"

describe("splitEmbedQuery", () => {
  it("separates context and theme overrides", () => {
    const r = splitEmbedQuery({
      user_id: "42",
      _theme: "dark",
      _bg: "#000",
      _preview: "1",
    })
    expect(r.context).toEqual({ user_id: "42" })
    expect(r.themeSlug).toBe("dark")
    expect(r.themeVarOverrides["--sn-bg"]).toBe("#000")
  })
})
