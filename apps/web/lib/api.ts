import type {
  FusionField,
  FusionNode,
  FusionRecordsPage,
  WikiInlineMwsAggregateValue,
  WikiInlineMwsSnippetValue,
  WikiComment,
  WikiGraphData,
  WikiMwsBlockConfig,
  WikiPageRow,
  WikiTag,
  WikiVersionFull,
  WikiVersionSummary,
} from "./wiki-types"

// All requests go through the Next.js BFF proxy which injects the Bearer token.
// SSR: relative URL resolves against the current host automatically.
const BASE_URL = "/api/backend"

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = text
    }
    throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body })
  }
  return res.json() as Promise<T>
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    cache: "no-store",
    credentials: "include",
  })
  if (!res.ok) {
    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = text
    }
    throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body })
  }
}

export type WikiAiSuggestStreamEvent =
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; message: string }

function wikiAiSsePayloadFromFrame(frame: string): string | null {
  const dataLines: string[] = []
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (!dataLines.length) return null
  return dataLines.join("\n")
}

export const api = {
  wiki: {
    listPages: () => json<WikiPageRow[]>("/api/v1/wiki/pages"),
    getPage: (id: string) => json<WikiPageRow>(`/api/v1/wiki/pages/${id}`),
    createPage: (body: { slug: string; title?: string; parent_id?: string; icon?: string }) =>
      json<WikiPageRow>("/api/v1/wiki/pages", { method: "POST", body: JSON.stringify(body) }),
    updatePage: (id: string, body: Partial<WikiPageRow>) =>
      json<WikiPageRow>(`/api/v1/wiki/pages/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deletePage: (id: string) => del(`/api/v1/wiki/pages/${id}`),
    getBacklinks: (id: string) => json<WikiPageRow[]>(`/api/v1/wiki/pages/${id}/backlinks`),
    listTags: (query?: string) =>
      json<WikiTag[]>(`/api/v1/wiki/tags${query ? `?q=${encodeURIComponent(query)}` : ""}`),
    createTag: (name: string) =>
      json<WikiTag>("/api/v1/wiki/tags", { method: "POST", body: JSON.stringify({ name }) }),
    saveSnapshot: (pageId: string, stateB64: string) =>
      json<{ saved: boolean }>(`/api/v1/wiki/pages/${pageId}/snapshot`, {
        method: "PUT",
        body: JSON.stringify({ state: stateB64 }),
      }),
    getSnapshot: (pageId: string) =>
      json<{ state: string | null }>(`/api/v1/wiki/pages/${pageId}/snapshot`),

    getComments: (pageId: string) => json<WikiComment[]>(`/api/v1/wiki/pages/${pageId}/comments`),
    createComment: (pageId: string, body: { block_id?: string; body: string; author?: string; range_start?: number; range_end?: number; parent_id?: string }) =>
      json<WikiComment>(`/api/v1/wiki/pages/${pageId}/comments`, { method: "POST", body: JSON.stringify(body) }),
    updateComment: (pageId: string, commentId: string, body: { body?: string; resolved?: boolean }) =>
      json<WikiComment>(`/api/v1/wiki/pages/${pageId}/comments/${commentId}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteComment: (pageId: string, commentId: string) => del(`/api/v1/wiki/pages/${pageId}/comments/${commentId}`),

    listVersions: (pageId: string) => json<WikiVersionSummary[]>(`/api/v1/wiki/pages/${pageId}/versions`),
    createVersion: (pageId: string, label?: string) =>
      json<WikiVersionSummary>(`/api/v1/wiki/pages/${pageId}/versions`, { method: "POST", body: JSON.stringify({ label }) }),
    getVersion: (pageId: string, versionId: string) => json<WikiVersionFull>(`/api/v1/wiki/pages/${pageId}/versions/${versionId}`),
    restoreVersion: (pageId: string, versionId: string) =>
      json<{ restored: boolean; from_version: number }>(`/api/v1/wiki/pages/${pageId}/versions/${versionId}/restore`, { method: "POST" }),

    listMwsDatasheets: () => json<FusionNode[]>("/api/v1/wiki/mws/datasheets"),
    getMwsFields: (dstId: string, viewId?: string) =>
      json<FusionField[]>(`/api/v1/wiki/mws/datasheets/${dstId}/fields${viewId ? `?viewId=${encodeURIComponent(viewId)}` : ""}`),
    getMwsRecords: (dstId: string, opts: { filterByFormula?: string; pageSize?: number; pageNum?: number; viewId?: string; fieldKey?: string; refreshIntervalSecs?: number }) => {
      const params = new URLSearchParams()
      if (opts.filterByFormula) params.set("filterByFormula", opts.filterByFormula)
      if (opts.pageSize) params.set("pageSize", String(opts.pageSize))
      if (opts.pageNum) params.set("pageNum", String(opts.pageNum))
      if (opts.viewId) params.set("viewId", opts.viewId)
      if (opts.fieldKey) params.set("fieldKey", opts.fieldKey)
      if (opts.refreshIntervalSecs) params.set("refreshIntervalSecs", String(opts.refreshIntervalSecs))
      const qs = params.toString()
      return json<FusionRecordsPage>(`/api/v1/wiki/mws/datasheets/${dstId}/records${qs ? `?${qs}` : ""}`)
    },
    patchMwsRecord: (dstId: string, recordId: string, fields: Record<string, unknown>) =>
      json<void>(`/api/v1/wiki/mws/datasheets/${dstId}/records/${recordId}`, { method: "PATCH", body: JSON.stringify({ fields }) }),
    getMwsSnippetValue: (
      dstId: string,
      opts: { pkColumn: string; pkValue: string; valueColumn: string; viewId?: string },
    ) => {
      const params = new URLSearchParams({
        pkColumn: opts.pkColumn,
        pkValue: opts.pkValue,
        valueColumn: opts.valueColumn,
      })
      if (opts.viewId) params.set("viewId", opts.viewId)
      return json<WikiInlineMwsSnippetValue>(
        `/api/v1/wiki/mws/datasheets/${dstId}/snippet-value?${params.toString()}`,
      )
    },
    getMwsAggregateValue: (
      dstId: string,
      opts: { kind: "count" | "median" | "min" | "max" | "avg" | "mode"; column?: string; viewId?: string; filterByFormula?: string },
    ) => {
      const params = new URLSearchParams({ kind: opts.kind })
      if (opts.column) params.set("column", opts.column)
      if (opts.viewId) params.set("viewId", opts.viewId)
      if (opts.filterByFormula) params.set("filterByFormula", opts.filterByFormula)
      return json<WikiInlineMwsAggregateValue>(
        `/api/v1/wiki/mws/datasheets/${dstId}/aggregate?${params.toString()}`,
      )
    },
    getMwsBlockConfig: (pageId: string, blockId: string) =>
      json<WikiMwsBlockConfig>(`/api/v1/wiki/mws/pages/${pageId}/blocks/${blockId}/config`),
    putMwsBlockConfig: (pageId: string, blockId: string, config: Partial<WikiMwsBlockConfig>) =>
      json<WikiMwsBlockConfig>(`/api/v1/wiki/mws/pages/${pageId}/blocks/${blockId}/config`, { method: "PUT", body: JSON.stringify(config) }),

    getGraph: () => json<WikiGraphData>("/api/v1/wiki/graph"),
    getEgoGraph: (pageId: string) => json<WikiGraphData>(`/api/v1/wiki/graph/page/${pageId}`),

    streamAiSuggestion: async (args: {
      prompt: string
      context: string
      signal: AbortSignal
      onEvent: (ev: WikiAiSuggestStreamEvent) => void
    }): Promise<void> => {
      const { prompt, context, signal, onEvent } = args
      let res: Response
      try {
        res = await fetch(`${BASE_URL}/api/v1/wiki/ai/suggest`, {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, context }),
          signal,
        })
      } catch (e) {
        if (signal.aborted) return
        onEvent({ type: "error", message: String(e) })
        return
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        onEvent({ type: "error", message: text || `HTTP ${res.status}` })
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        onEvent({ type: "error", message: "No response body" })
        return
      }

      const decoder = new TextDecoder()
      let buffer = ""
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (value) {
            buffer += decoder.decode(value, { stream: true })
          }

          let sep: number
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep)
            buffer = buffer.slice(sep + 2)
            const payload = wikiAiSsePayloadFromFrame(frame)
            if (payload == null) continue
            try {
              const data = JSON.parse(payload) as { type: string; text?: string; message?: string }
              if (data.type === "token" && typeof data.text === "string") {
                onEvent({ type: "token", text: data.text })
              } else if (data.type === "done") {
                onEvent({ type: "done" })
              } else if (data.type === "error") {
                onEvent({ type: "error", message: data.message ?? "Unknown error" })
              }
            } catch {
              // ignore malformed SSE JSON
            }
          }

          if (done) break
        }
        buffer += decoder.decode()
        if (buffer.trim()) {
          const payload = wikiAiSsePayloadFromFrame(buffer)
          if (payload) {
            try {
              const data = JSON.parse(payload) as { type: string; text?: string; message?: string }
              if (data.type === "token" && typeof data.text === "string") {
                onEvent({ type: "token", text: data.text })
              } else if (data.type === "done") {
                onEvent({ type: "done" })
              } else if (data.type === "error") {
                onEvent({ type: "error", message: data.message ?? "Unknown error" })
              }
            } catch {
              // ignore
            }
          }
        }
      } catch (e) {
        if (signal.aborted) return
        onEvent({ type: "error", message: String(e) })
      }
    },
    summarizePage: (content: string) =>
      json<{ summary: string }>("/api/v1/wiki/ai/summarize", { method: "POST", body: JSON.stringify({ content }) }),
  },
}
