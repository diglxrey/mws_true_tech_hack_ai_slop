import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { RenderCacheService, renderCacheRedisKey } from "../redis/render-cache.service"
import { MetaService } from "../meta/meta.service"
import { HtmlSanitizeService } from "./sanitize/html-sanitize.service"
import type { SnippetVariableRow } from "../sql/sql-builder.types"
import type { SnippetWithVariables } from "./snippets.repository"
import { buildMwsFilterFormula } from "../mws/filter-formula"
import { FusionClientService } from "../mws/fusion-client.service"
import { fetchRecordsCapped } from "../mws/mws-records.util"

async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  async function worker() {
    while (index < items.length) {
      const i = index++
      results[i] = await fn(items[i]!)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker)
  await Promise.all(workers)
  return results
}

export interface VariableRenderInfo {
  status: "ok" | "fallback"
  value: string
  duration_ms: number
}

export interface RenderPayload {
  slug: string
  text: string
  variables: Record<string, VariableRenderInfo>
  rendered_at: string
  from_cache: boolean
}

function cellToString(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "bigint") return v.toString()
  if (typeof v === "object") {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseNumberForAgg(s: string): number | null {
  const t = s.trim().replaceAll(",", ".")
  if (t === "") return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function maxRecordsCap(config: ConfigService): number {
  const raw = config.get<string>("MWS_MAX_RECORDS_PER_VARIABLE")?.trim()
  const n = raw ? Number.parseInt(raw, 10) : 10_000
  if (!Number.isFinite(n) || n < 1) return 10_000
  return Math.min(n, 500_000)
}

@Injectable()
export class RenderService {
  private readonly log = new Logger(RenderService.name)

  constructor(
    private readonly fusion: FusionClientService,
    private readonly meta: MetaService,
    private readonly cache: RenderCacheService,
    private readonly htmlSanitize: HtmlSanitizeService,
    private readonly config: ConfigService,
  ) {}

  async render(
    snippet: SnippetWithVariables,
    context: Record<string, string>,
    options?: { useCache?: boolean },
  ): Promise<RenderPayload> {
    const useCache =
      options?.useCache !== false && snippet.cache_ttl_seconds > 0
    const key = renderCacheRedisKey(snippet.slug, context)

    if (useCache) {
      const hit = await this.cache.get(key)
      if (hit) {
        try {
          const parsed = JSON.parse(hit) as RenderPayload
          return { ...parsed, from_cache: true }
        } catch {
          /* ignore bad cache */
        }
      }
    }

    const varOut: Record<string, VariableRenderInfo> = {}
    const results = await concurrentMap(
      snippet.variables,
      (v) => this.evaluateVariable(v, context),
      8,
    )
    snippet.variables.forEach((v, i) => {
      varOut[v.placeholder_name] = results[i]!
    })

    const rawTemplate =
      snippet.render_mode === "html" ? (snippet.html_template ?? "") : snippet.template
    let text = rawTemplate
    for (const v of snippet.variables) {
      const re = new RegExp(`\\{\\{\\s*${escapeRegExp(v.placeholder_name)}\\s*\\}\\}`, "g")
      text = text.replace(re, varOut[v.placeholder_name]!.value)
    }
    if (snippet.render_mode === "html") {
      text = this.htmlSanitize.sanitize(text)
    }

    const payload: RenderPayload = {
      slug: snippet.slug,
      text,
      variables: varOut,
      rendered_at: new Date().toISOString(),
      from_cache: false,
    }

    if (useCache) {
      await this.cache.set(key, snippet.cache_ttl_seconds, JSON.stringify(payload))
    }

    return payload
  }

  private resolveFilter(
    variable: SnippetVariableRow,
    context: Record<string, string>,
    cols: Set<string>,
  ):
    | { ok: true; formula?: string }
    | { ok: false; missingContextKey: string }
    | { ok: false; unsupported: string }
    | { ok: false; impossible: "empty_in" } {
    const r = buildMwsFilterFormula(variable.filters, context, cols)
    if (r.ok) {
      return { ok: true, formula: r.formula === "" ? undefined : r.formula }
    }
    if ("missingContextKey" in r) {
      return { ok: false, missingContextKey: r.missingContextKey }
    }
    if ("impossible" in r) {
      return { ok: false, impossible: r.impossible }
    }
    return { ok: false, unsupported: r.unsupported }
  }

  async evaluateVariable(
    variable: SnippetVariableRow,
    context: Record<string, string>,
  ): Promise<VariableRenderInfo> {
    const allowedTable = await this.meta.isTableAllowed(variable.source_table)
    if (!allowedTable) {
      this.log.warn(`Unknown datasheet in variable ${variable.id}: ${variable.source_table}`)
      throw new InternalServerErrorException()
    }
    const cols = await this.meta.columnSetForTable(variable.source_table)
    const fr = this.resolveFilter(variable, context, cols)
    if (!fr.ok) {
      if ("missingContextKey" in fr) {
        throw new BadRequestException({
          message: "Missing context parameter",
          missingContextKey: fr.missingContextKey,
        })
      }
      if ("unsupported" in fr) {
        throw new BadRequestException(fr.unsupported)
      }
      return this.emptyInResult(variable)
    }
    const filterByFormula = fr.formula
    const cap = maxRecordsCap(this.config)
    const dstId = variable.source_table
    const t0 = Date.now()

    try {
      if (variable.mode === "scalar") {
        const page = await this.fusion.getRecords(dstId, {
          filterByFormula,
          pageNum: 1,
          pageSize: 1,
          maxRecords: 1,
          cellFormat: "string",
          fieldKey: "name",
        })
        const duration_ms = Date.now() - t0
        const raw = page.records[0]?.fields?.[variable.source_column]
        const str = cellToString(raw)
        if (str === "" || raw == null) {
          return { status: "fallback", value: variable.fallback_value, duration_ms }
        }
        return { status: "ok", value: str, duration_ms }
      }

      if (variable.mode === "aggregate") {
        const fn = variable.aggregate_fn ?? "COUNT"
        const isCountStar =
          fn === "COUNT" && (variable.source_column === "*" || variable.source_column === "")

        if (isCountStar) {
          const page = await this.fusion.getRecords(dstId, {
            filterByFormula,
            pageNum: 1,
            pageSize: 1,
            maxRecords: 1,
            cellFormat: "string",
            fieldKey: "name",
          })
          const duration_ms = Date.now() - t0
          return { status: "ok", value: String(page.total), duration_ms }
        }

        const { records, truncated } = await fetchRecordsCapped(
          this.fusion,
          dstId,
          { filterByFormula },
          cap,
        )
        if (truncated) {
          throw new BadRequestException(
            `Too many matching rows for aggregate (>${cap}). Raise MWS_MAX_RECORDS_PER_VARIABLE or narrow filters.`,
          )
        }
        const duration_ms = Date.now() - t0
        const vals = records.map((r) => cellToString(r.fields?.[variable.source_column]))
        const numVals = vals.map(parseNumberForAgg)

        if (fn === "COUNT") {
          const c = vals.filter((s) => s !== "").length
          return { status: "ok", value: String(c), duration_ms }
        }
        if (fn === "SUM" || fn === "AVG") {
          const nums = numVals.filter((n): n is number => n != null)
          if (nums.length === 0) {
            return { status: "fallback", value: variable.fallback_value, duration_ms }
          }
          const sum = nums.reduce((a, b) => a + b, 0)
          const out = fn === "SUM" ? sum : sum / nums.length
          return { status: "ok", value: String(out), duration_ms }
        }
        if (fn === "MIN" || fn === "MAX") {
          const nums = numVals.filter((n): n is number => n != null)
          if (nums.length > 0) {
            const out =
              fn === "MIN"
                ? nums.reduce((a, b) => (a < b ? a : b))
                : nums.reduce((a, b) => (a > b ? a : b))
            return { status: "ok", value: String(out), duration_ms }
          }
          const nonEmpty = vals.filter((s) => s !== "")
          if (nonEmpty.length === 0) {
            return { status: "fallback", value: variable.fallback_value, duration_ms }
          }
          const out =
            fn === "MIN"
              ? nonEmpty.reduce((a, b) => (a < b ? a : b))
              : nonEmpty.reduce((a, b) => (a > b ? a : b))
          return { status: "ok", value: out, duration_ms }
        }
        this.log.warn(`Unknown aggregate ${fn} for variable ${variable.id}`)
        throw new InternalServerErrorException()
      }

      /* concat */
      const sort =
        variable.concat_order_column != null && variable.concat_order_column !== ""
          ? [
              {
                field: variable.concat_order_column,
                order: (variable.concat_order_dir ?? "ASC").toLowerCase() as "asc" | "desc",
              },
            ]
          : undefined
      const lim =
        variable.concat_limit != null && variable.concat_limit > 0
          ? Math.min(variable.concat_limit, cap)
          : cap
      const { records, truncated } = await fetchRecordsCapped(
        this.fusion,
        dstId,
        { filterByFormula, sort },
        lim,
      )
      if (truncated && records.length >= lim) {
        this.log.warn(`Concat truncated for variable ${variable.id} at ${lim} rows`)
      }
      const duration_ms = Date.now() - t0
      const parts = records.map((r) => cellToString(r.fields?.[variable.source_column]))
      const joined = parts.join(variable.concat_separator ?? "")
      if (joined === "") {
        return { status: "fallback", value: variable.fallback_value, duration_ms }
      }
      return { status: "ok", value: joined, duration_ms }
    } catch (e) {
      if (e instanceof BadRequestException) throw e
      this.log.error(`MWS error for variable ${variable.id}`, e)
      throw new InternalServerErrorException()
    }
  }

  private emptyInResult(variable: SnippetVariableRow): VariableRenderInfo {
    const duration_ms = 0
    if (variable.mode === "aggregate") {
      const fn = variable.aggregate_fn ?? "COUNT"
      if (fn === "COUNT") {
        return { status: "ok", value: "0", duration_ms }
      }
    }
    return { status: "fallback", value: variable.fallback_value, duration_ms }
  }

  async previewSqlAsync(
    variable: SnippetVariableRow,
    context: Record<string, string>,
  ): Promise<{ previewSql: string } | { missingContextKey: string }> {
    const allowedTable = await this.meta.isTableAllowed(variable.source_table)
    if (!allowedTable) {
      throw new BadRequestException("Unknown source_table")
    }
    const cols = await this.meta.columnSetForTable(variable.source_table)
    const fr = this.resolveFilter(variable, context, cols)
    if (!fr.ok) {
      if ("missingContextKey" in fr) {
        return { missingContextKey: fr.missingContextKey }
      }
      if ("unsupported" in fr) {
        throw new BadRequestException(fr.unsupported)
      }
      return {
        previewSql: `MWS: impossible filter (empty IN); mode=${variable.mode}; dstId=${variable.source_table}`,
      }
    }
    const filterByFormula = fr.formula ?? "(none)"
    const sort =
      variable.mode === "concat" && variable.concat_order_column
        ? `${variable.concat_order_column} ${variable.concat_order_dir ?? "ASC"}`
        : "(none)"
    const cap = maxRecordsCap(this.config)
    const lim =
      variable.mode === "concat" && variable.concat_limit != null && variable.concat_limit > 0
        ? Math.min(variable.concat_limit, cap)
        : variable.mode === "concat"
          ? cap
          : "(n/a)"
    return {
      previewSql: `MWS: dstId=${variable.source_table}; mode=${variable.mode}; filterByFormula=${filterByFormula}; sort=${sort}; field=${variable.source_column}; concat_limit=${lim}; max_rows_cap=${cap}`,
    }
  }
}
