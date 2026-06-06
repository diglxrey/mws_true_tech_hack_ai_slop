import { Injectable } from "@nestjs/common"
import type { FusionNode } from "../mws/fusion.types"
import { FusionClientService } from "../mws/fusion-client.service"

const META_FUSION_CACHE_MS = 60_000

export interface FusionMetaTable {
  /** Datasheet id (`dst…`), stored in `snippet_variables.source_table`. */
  table_name: string
  /** Human-readable name for UI. */
  display_name: string
  row_count_estimate: number
}

export interface FusionMetaColumn {
  column_name: string
  data_type: string
  is_nullable: boolean
}

function walkDatasheetNodes(nodes: FusionNode[]): FusionNode[] {
  const out: FusionNode[] = []
  for (const n of nodes) {
    if (n.id?.startsWith("dst")) {
      out.push(n)
    }
    if (n.children?.length) {
      out.push(...walkDatasheetNodes(n.children))
    }
  }
  return out
}

@Injectable()
export class MetaService {
  constructor(private readonly fusion: FusionClientService) {}

  private tablesFusionCache: { at: number; data: FusionMetaTable[] } | null = null
  private tablesFusionPending: Promise<FusionMetaTable[]> | null = null
  private columnsFusionCache = new Map<string, { at: number; data: FusionMetaColumn[] }>()
  private columnsFusionPending = new Map<string, Promise<FusionMetaColumn[]>>()

  private async loadDatasheets(): Promise<FusionMetaTable[]> {
    const spaceId = await this.fusion.resolveSpaceId()
    const roots = await this.fusion.getSpaceNodes(spaceId)
    const sheets = walkDatasheetNodes(roots)
    return sheets.map((n) => ({
      table_name: n.id,
      display_name: (n.name ?? n.id).trim() || n.id,
      row_count_estimate: 0,
    }))
  }

  /**
   * Public meta + validation: list of datasheet ids (`dst…`).
   */
  async listTables(): Promise<string[]> {
    const tables = await this.listFusionMetaTables()
    return tables.map((t) => t.table_name)
  }

  async listColumns(tableName: string): Promise<{ name: string; dataType: string }[]> {
    const cols = await this.listFusionMetaColumns(tableName)
    return cols.map((c) => ({ name: c.column_name, dataType: c.data_type }))
  }

  /** Fusion datasheets in the configured space; cached with promise deduplication. */
  async listFusionMetaTables(): Promise<FusionMetaTable[]> {
    const now = Date.now()
    if (this.tablesFusionCache && now - this.tablesFusionCache.at < META_FUSION_CACHE_MS) {
      return this.tablesFusionCache.data
    }
    if (this.tablesFusionPending) {
      return this.tablesFusionPending
    }
    this.tablesFusionPending = this.loadDatasheets().then((data) => {
      this.tablesFusionCache = { at: Date.now(), data }
      this.tablesFusionPending = null
      return data
    }).catch((err) => {
      this.tablesFusionPending = null
      throw err
    })
    return this.tablesFusionPending
  }

  /** Fields for a datasheet; cached per table with promise deduplication. */
  async listFusionMetaColumns(tableName: string): Promise<FusionMetaColumn[]> {
    const tables = await this.listFusionMetaTables()
    if (!tables.some((t) => t.table_name === tableName)) {
      return []
    }
    const now = Date.now()
    const hit = this.columnsFusionCache.get(tableName)
    if (hit && now - hit.at < META_FUSION_CACHE_MS) {
      return hit.data
    }
    const pending = this.columnsFusionPending.get(tableName)
    if (pending) {
      return pending
    }
    const p = this.fusion.getDatasheetFields(tableName).then((fields) => {
      const data: FusionMetaColumn[] = fields.map((f) => ({
        column_name: f.name,
        data_type: f.type ?? "unknown",
        is_nullable: true,
      }))
      this.columnsFusionCache.set(tableName, { at: Date.now(), data })
      this.columnsFusionPending.delete(tableName)
      return data
    }).catch((err) => {
      this.columnsFusionPending.delete(tableName)
      throw err
    })
    this.columnsFusionPending.set(tableName, p)
    return p
  }

  async isTableAllowed(tableName: string): Promise<boolean> {
    const tables = await this.listFusionMetaTables()
    return tables.some((t) => t.table_name === tableName)
  }

  async columnSetForTable(tableName: string): Promise<Set<string>> {
    const cols = await this.listColumns(tableName)
    return new Set(cols.map((c) => c.name))
  }
}
