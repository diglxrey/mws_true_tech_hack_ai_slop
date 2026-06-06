import { BadRequestException } from "@nestjs/common"

export function queryStringRecord(
  query: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue
    out[k] = Array.isArray(v) ? (v[0] ?? "") : v
  }
  return out
}

export function stringifyContext(raw: unknown): Record<string, string> {
  if (raw == null) {
    return {}
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new BadRequestException("context must be an object")
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined) {
      out[k] = ""
    } else if (typeof v === "string") {
      out[k] = v
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = String(v)
    } else {
      throw new BadRequestException(`context.${k} must be a string, number, or boolean`)
    }
  }
  return out
}
