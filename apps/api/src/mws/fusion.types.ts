/** Subset of MWS Tables Fusion API JSON shapes. */

export interface FusionSpace {
  id: string
  name?: string
  isAdmin?: boolean
}

export interface FusionNode {
  id: string
  name?: string
  type?: string
  children?: FusionNode[]
}

export interface FusionField {
  id: string
  name: string
  type?: string
  desc?: string
  property?: Record<string, unknown>
}

export interface FusionRecord {
  recordId: string
  fields: Record<string, unknown>
  createdAt?: number
  updatedAt?: number
}

export interface FusionRecordsPage {
  pageNum: number
  pageSize: number
  total: number
  records: FusionRecord[]
}
