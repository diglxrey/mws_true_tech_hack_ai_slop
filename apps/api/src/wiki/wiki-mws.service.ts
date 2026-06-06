import { BadRequestException, Inject, Injectable } from "@nestjs/common"
import { createHash } from "node:crypto"
import type { Pool } from "pg"
import { FusionClientService } from "../mws/fusion-client.service"
import { RenderCacheService } from "../redis/render-cache.service"
import type {
  ResolveMwsAggregateDto,
  ResolveMwsAggregateResult,
  ResolveMwsSnippetValueDto,
  ResolveMwsSnippetValueResult,
  UpsertMwsBlockConfigDto,
  WikiMwsBlockConfig,
} from "./wiki.types"
import { normalizeWikiMwsPageNum, normalizeWikiMwsPageSize } from "./wiki-mws-pagination.util"

function fieldRef(column: string): string {
  const safe = column.replaceAll("}", "").replaceAll("{", "")
  return `{${safe}}`
}

function escapeFormulaString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
}

function isValidPhoneValue(value: unknown): boolean {
  if (value === null || value === undefined) return true

  const stringValue = typeof value === "string" ? value : typeof value === "number" ? String(value) : null
  if (stringValue === null) return false

  const trimmed = stringValue.trim()
  if (!trimmed) return true
  if (!/^\+?[\d()\s-]+$/.test(trimmed)) return false

  const openingParens = (trimmed.match(/\(/g) ?? []).length
  const closingParens = (trimmed.match(/\)/g) ?? []).length
  if (openingParens !== closingParens) return false

  const digits = trimmed.replace(/\D/g, "")
  return digits.length >= 7 && digits.length <= 15
}

function isValidEmailValue(value: unknown): boolean {
  if (value === null || value === undefined) return true

  const stringValue = typeof value === "string" ? value : typeof value === "number" ? String(value) : null
  if (stringValue === null) return false

  const trimmed = stringValue.trim()
  if (!trimmed) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

const WIKI_AGGREGATION_ROW_CAP = 100
const WIKI_AGGREGATION_TTL_SECS = 10

function toNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed.replace(",", "."))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toCategoricalValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    const normalized = value.map((item) => toCategoricalValue(item)).filter((item): item is string => Boolean(item))
    return normalized.length > 0 ? normalized.join(", ") : null
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

@Injectable()
export class WikiMwsService {
  constructor(
    private readonly fusion: FusionClientService,
    private readonly cache: RenderCacheService,
    @Inject("META_PG_POOL") private readonly pool: Pool,
  ) {}

  async listDatasheets() {
    const spaceId = await this.fusion.resolveSpaceId()
    return this.fusion.getSpaceNodes(spaceId)
  }

  async getFields(dstId: string, viewId?: string) {
    return this.fusion.getDatasheetFields(dstId, viewId)
  }

  async getRecords(
    dstId: string,
    opts: {
      viewId?: string
      filterByFormula?: string
      pageSize?: number
      pageNum?: number
      fieldKey?: "name" | "id"
    },
    ttlSecs = 30,
  ) {
    const pageSize = normalizeWikiMwsPageSize(opts.pageSize)
    const pageNum = normalizeWikiMwsPageNum(opts.pageNum)
    const normalizedOpts = {
      ...opts,
      pageSize,
      pageNum,
    }

    const hash = createHash("sha256")
      .update(dstId + JSON.stringify(normalizedOpts))
      .digest("hex")
    const cacheKey = `snippeter:wiki:mws:${dstId}:${hash}`

    const cached = await this.cache.get(cacheKey)
    if (cached) return JSON.parse(cached) as unknown

    const result = await this.fusion.getRecords(dstId, {
      filterByFormula: opts.filterByFormula,
      viewId: opts.viewId,
      pageSize,
      pageNum,
      fieldKey: opts.fieldKey ?? "name",
    })

    await this.cache.set(cacheKey, ttlSecs, JSON.stringify(result))
    // Track this key under a per-dstId group so we can invalidate on patch
    await this.cache.trackInGroup(this.dstGroupKey(dstId), cacheKey, ttlSecs)
    return result
  }

  async patchRecord(dstId: string, recordId: string, fields: Record<string, unknown>) {
    const datasheetFields = await this.fusion.getDatasheetFields(dstId)
    const phoneFieldKeys = new Set(
      datasheetFields
        .filter((field) => field.type === "Phone")
        .flatMap((field) => [field.name, field.id]),
    )
    const emailFieldKeys = new Set(
      datasheetFields
        .filter((field) => field.type === "Email")
        .flatMap((field) => [field.name, field.id]),
    )

    for (const [fieldKey, value] of Object.entries(fields)) {
      if (phoneFieldKeys.has(fieldKey) && !isValidPhoneValue(value)) {
        throw new BadRequestException(`Invalid phone number for field \"${fieldKey}\"`)
      }
      if (emailFieldKeys.has(fieldKey) && !isValidEmailValue(value)) {
        throw new BadRequestException(`Invalid email address for field \"${fieldKey}\"`)
      }
    }

    await this.fusion.patchRecord(dstId, recordId, fields)
    // Invalidate all cached record pages for this datasheet
    await this.cache.invalidateGroup(this.dstGroupKey(dstId))
  }

  async resolveSnippetValue(
    dstId: string,
    dto: ResolveMwsSnippetValueDto,
  ): Promise<ResolveMwsSnippetValueResult> {
    const pkColumn = dto.pk_column?.trim()
    const pkValue = dto.pk_value?.trim()
    const valueColumn = dto.value_column?.trim()
    if (!pkColumn || !pkValue || !valueColumn) {
      throw new BadRequestException("pkColumn, pkValue, and valueColumn are required")
    }

    const fields = await this.fusion.getDatasheetFields(dstId, dto.view_id)
    const pkField = fields.find((field) => field.name === pkColumn || field.id === pkColumn)
    if (!pkField) {
      throw new BadRequestException(`Unknown PK column: "${pkColumn}"`)
    }
    const valueField = fields.find((field) => field.name === valueColumn || field.id === valueColumn)
    if (!valueField) {
      throw new BadRequestException(`Unknown value column: "${valueColumn}"`)
    }

    const filterByFormula = `${fieldRef(pkField.name)}="${escapeFormulaString(pkValue)}"`
    const recordsPage = await this.getRecords(
      dstId,
      {
        viewId: dto.view_id,
        filterByFormula,
        pageSize: 1,
        pageNum: 1,
        fieldKey: "name",
      },
      4,
    ) as {
      records: Array<{ recordId: string; fields: Record<string, unknown> }>
    }

    const first = recordsPage.records[0]
    if (!first) {
      return {
        found: false,
        record_id: null,
        value: null,
        fetched_at: new Date().toISOString(),
      }
    }

    return {
      found: true,
      record_id: first.recordId,
      value: first.fields[valueField.name] ?? null,
      fetched_at: new Date().toISOString(),
    }
  }

  async resolveAggregateValue(
    dstId: string,
    dto: ResolveMwsAggregateDto,
  ): Promise<ResolveMwsAggregateResult> {
    const allowedKinds = new Set(["count", "median", "min", "max", "avg", "mode"])
    const kind = dto.kind?.trim().toLowerCase()
    if (!kind || !allowedKinds.has(kind)) {
      throw new BadRequestException("Unsupported aggregation kind")
    }

    const cachePayload = {
      dstId,
      kind,
      column: dto.column ?? "",
      viewId: dto.view_id ?? "",
      filterByFormula: dto.filter_by_formula ?? "",
      cap: WIKI_AGGREGATION_ROW_CAP,
    }
    const cacheHash = createHash("sha256").update(JSON.stringify(cachePayload)).digest("hex")
    const cacheKey = `snippeter:wiki:mws-agg:${dstId}:${cacheHash}`
    const cached = await this.cache.get(cacheKey)
    if (cached) {
      return JSON.parse(cached) as ResolveMwsAggregateResult
    }

    const fields = await this.fusion.getDatasheetFields(dstId, dto.view_id)
    let columnName: string | null = null
    if (kind !== "count") {
      const rawColumn = dto.column?.trim()
      if (!rawColumn) throw new BadRequestException("column is required for this aggregation kind")
      const field = fields.find((item) => item.name === rawColumn || item.id === rawColumn)
      if (!field) throw new BadRequestException(`Unknown aggregation column: "${rawColumn}"`)
      columnName = field.name
    }

    const recordsPage = await this.getRecords(
      dstId,
      {
        viewId: dto.view_id,
        filterByFormula: dto.filter_by_formula,
        pageSize: WIKI_AGGREGATION_ROW_CAP,
        pageNum: 1,
        fieldKey: "name",
      },
      WIKI_AGGREGATION_TTL_SECS,
    ) as {
      total: number
      records: Array<{ fields: Record<string, unknown> }>
    }
    const sampledRecords = recordsPage.records.slice(0, WIKI_AGGREGATION_ROW_CAP)
    const truncated = (recordsPage.total ?? sampledRecords.length) > WIKI_AGGREGATION_ROW_CAP

    let value: number | string | null = null
    if (kind === "count") {
      value = sampledRecords.length
    } else if (kind === "mode") {
      const frequency = new Map<string, number>()
      for (const row of sampledRecords) {
        const asCategory = toCategoricalValue(row.fields[columnName!])
        if (!asCategory) continue
        frequency.set(asCategory, (frequency.get(asCategory) ?? 0) + 1)
      }
      if (frequency.size > 0) {
        const entries = [...frequency.entries()].sort((left, right) => {
          if (right[1] !== left[1]) return right[1] - left[1]
          return left[0].localeCompare(right[0])
        })
        value = entries[0]?.[0] ?? null
      }
    } else {
      const numeric = sampledRecords
        .map((row) => toNumericValue(row.fields[columnName!]))
        .filter((num): num is number => num !== null)
      if (numeric.length > 0) {
        const sorted = [...numeric].sort((left, right) => left - right)
        switch (kind) {
          case "min":
            value = sorted[0] ?? null
            break
          case "max":
            value = sorted[sorted.length - 1] ?? null
            break
          case "avg":
            value = numeric.reduce((acc, current) => acc + current, 0) / numeric.length
            break
          case "median": {
            const middle = Math.floor(sorted.length / 2)
            value = sorted.length % 2 === 0
              ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
              : (sorted[middle] ?? null)
            break
          }
          default:
            throw new BadRequestException("Unsupported numeric aggregation")
        }
      }
    }

    const result: ResolveMwsAggregateResult = {
      kind: kind as ResolveMwsAggregateResult["kind"],
      column: columnName,
      value,
      sampled_count: sampledRecords.length,
      truncated,
      fetched_at: new Date().toISOString(),
    }
    await this.cache.set(cacheKey, WIKI_AGGREGATION_TTL_SECS, JSON.stringify(result))
    await this.cache.trackInGroup(this.dstGroupKey(dstId), cacheKey, WIKI_AGGREGATION_TTL_SECS)
    return result
  }

  private dstGroupKey(dstId: string): string {
    return `snippeter:wiki:mws-group:${dstId}`
  }

  async getBlockConfig(pageId: string, blockId: string): Promise<WikiMwsBlockConfig | null> {
    try {
      const result = await this.pool.query<WikiMwsBlockConfig>(
        `SELECT id, page_id, block_id, dst_id, view_id, filter_by_formula, page_size,
                refresh_interval_secs, allow_edit_back, created_at, updated_at
         FROM wiki_mws_block_configs
         WHERE page_id = $1 AND block_id = $2`,
        [pageId, blockId],
      )
      if (!result || !result.rows) {
        console.error("Pool query returned unexpected result:", result)
        return null
      }
      const row = result.rows[0] ?? null
      if (!row) return null
      return { ...row, page_size: normalizeWikiMwsPageSize(row.page_size) }
    } catch (err) {
      console.error("Error fetching MWS block config:", err)
      throw err
    }
  }

  async upsertBlockConfig(pageId: string, blockId: string, dto: UpsertMwsBlockConfigDto): Promise<WikiMwsBlockConfig> {
    const pageSize = normalizeWikiMwsPageSize(dto.page_size)
    const { rows } = await this.pool.query<WikiMwsBlockConfig>(
      `INSERT INTO wiki_mws_block_configs
         (page_id, block_id, dst_id, view_id, filter_by_formula, page_size, refresh_interval_secs, allow_edit_back)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (page_id, block_id) DO UPDATE SET
         dst_id                = EXCLUDED.dst_id,
         view_id               = EXCLUDED.view_id,
         filter_by_formula     = EXCLUDED.filter_by_formula,
         page_size             = EXCLUDED.page_size,
         refresh_interval_secs = EXCLUDED.refresh_interval_secs,
         allow_edit_back       = EXCLUDED.allow_edit_back
       RETURNING id, page_id, block_id, dst_id, view_id, filter_by_formula, page_size,
                 refresh_interval_secs, allow_edit_back, created_at, updated_at`,
      [
        pageId,
        blockId,
        dto.dst_id,
        dto.view_id ?? null,
        dto.filter_by_formula ?? null,
        pageSize,
        dto.refresh_interval_secs ?? 30,
        dto.allow_edit_back ?? false,
      ],
    )
    return rows[0]!
  }
}
