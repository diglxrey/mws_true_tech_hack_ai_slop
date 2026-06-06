import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type {
  FusionField,
  FusionNode,
  FusionRecordsPage,
  FusionSpace,
} from "./fusion.types"

interface BackendEnvelope<T> {
  success?: boolean
  code?: number
  message?: string
  data?: T
}

const SPACE_ID_TTL_MS = 5 * 60_000 // 5 minutes

@Injectable()
export class FusionClientService {
  private readonly log = new Logger(FusionClientService.name)
  private resolvedSpaceId: string | null = null
  private resolvedSpaceIdAt: number | null = null

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    const u = this.config.getOrThrow<string>("MWS_FUSION_BASE_URL").replace(/\/+$/, "")
    return u
  }

  private token(): string {
    return this.config.getOrThrow<string>("MWS_TOKEN").trim()
  }

  private configuredSpaceId(): string | undefined {
    const s = this.config.get<string>("MWS_SPACE_ID")?.trim()
    return s && s.length > 0 ? s : undefined
  }

  async patchRecord(dstId: string, recordId: string, fields: Record<string, unknown>): Promise<void> {
    // fieldKey is required by the MWS UpdateRecordsRequest schema.
    // We read/write records using field names (fieldKey="name").
    await this.fetchJson(`/fusion/v1/datasheets/${encodeURIComponent(dstId)}/records`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ recordId, fields }], fieldKey: "name" }),
    })
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl()}${path.startsWith("/") ? path : `/${path}`}`
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token()}`,
        Accept: "application/json",
        ...(init?.headers as Record<string, string>),
      },
    })
    const text = await res.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      this.log.warn(`Non-JSON response ${res.status} ${path}: ${text.slice(0, 200)}`)
      throw new Error(`Fusion API non-JSON (${res.status})`)
    }
    if (!res.ok) {
      const msg =
        typeof body === "object" && body !== null && "message" in body
          ? String((body as { message: unknown }).message)
          : text.slice(0, 200)
      throw new Error(`Fusion API ${res.status}: ${msg}`)
    }
    return body as T
  }

  async resolveSpaceId(): Promise<string> {
    const fixed = this.configuredSpaceId()
    if (fixed) {
      return fixed
    }
    const now = Date.now()
    if (this.resolvedSpaceId && this.resolvedSpaceIdAt && now - this.resolvedSpaceIdAt < SPACE_ID_TTL_MS) {
      return this.resolvedSpaceId
    }
    const env = await this.fetchJson<BackendEnvelope<{ spaces?: FusionSpace[] }>>(
      "/fusion/v1/spaces",
    )
    const spaces = env.data?.spaces ?? []
    const first = spaces[0]
    if (!first?.id) {
      throw new Error("MWS_SPACE_ID not set and no spaces returned from Fusion API")
    }
    this.resolvedSpaceId = first.id
    this.resolvedSpaceIdAt = now
    this.log.log(`MWS_SPACE_ID resolved to first space: ${first.id}`)
    return first.id
  }

  async getSpaceNodes(spaceId: string): Promise<FusionNode[]> {
    const env = await this.fetchJson<BackendEnvelope<{ nodes?: FusionNode[] }>>(
      `/fusion/v1/spaces/${encodeURIComponent(spaceId)}/nodes`,
    )
    return env.data?.nodes ?? []
  }

  async getDatasheetFields(dstId: string, viewId?: string): Promise<FusionField[]> {
    const q = viewId ? `?viewId=${encodeURIComponent(viewId)}` : ""
    const env = await this.fetchJson<
      BackendEnvelope<{ fields?: FusionField[]; fieldKey?: string }>
    >(`/fusion/v1/datasheets/${encodeURIComponent(dstId)}/fields${q}`)
    const raw = env.data?.fields
    return Array.isArray(raw) ? raw : []
  }

  async getRecords(
    dstId: string,
    opts: {
      filterByFormula?: string
      viewId?: string
      pageNum?: number
      pageSize?: number
      maxRecords?: number
      cellFormat?: "string" | "json"
      fieldKey?: "name" | "id"
      sort?: { field: string; order: "asc" | "desc" }[]
    },
  ): Promise<FusionRecordsPage> {
    const params = new URLSearchParams()
    if (opts.filterByFormula != null && opts.filterByFormula !== "") {
      params.set("filterByFormula", opts.filterByFormula)
    }
    if (opts.viewId != null && opts.viewId !== "") {
      params.set("viewId", opts.viewId)
    }
    if (opts.pageNum != null) params.set("pageNum", String(opts.pageNum))
    if (opts.pageSize != null) params.set("pageSize", String(opts.pageSize))
    if (opts.maxRecords != null) params.set("maxRecords", String(opts.maxRecords))
    params.set("cellFormat", opts.cellFormat ?? "string")
    params.set("fieldKey", opts.fieldKey ?? "name")
    if (opts.sort?.length) {
      opts.sort.forEach((s, i) => {
        params.set(`sort[${i}][field]`, s.field)
        params.set(`sort[${i}][order]`, s.order)
      })
    }
    const qs = params.toString()
    const path = `/fusion/v1/datasheets/${encodeURIComponent(dstId)}/records${qs ? `?${qs}` : ""}`
    const env = await this.fetchJson<
      BackendEnvelope<{
        pageNum?: number
        pageSize?: number
        total?: number
        records?: { recordId: string; fields?: Record<string, unknown> }[]
      }>
    >(path)
    const d = env.data
    const records = (d?.records ?? []).map((r) => ({
      recordId: r.recordId,
      fields: r.fields ?? {},
    }))
    return {
      pageNum: d?.pageNum ?? opts.pageNum ?? 1,
      pageSize: d?.pageSize ?? opts.pageSize ?? records.length,
      total: d?.total ?? records.length,
      records,
    }
  }
}
