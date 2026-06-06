import { Injectable } from "@nestjs/common"

/**
 * Strips dangerous CSS for HTML embed mode (defence in depth; user CSS is also prefixed).
 */
@Injectable()
export class CssSanitizeService {
  sanitize(css: string): string {
    let out = css
    out = out.replace(/\/\*[\s\S]*?\*\//g, "")
    out = out.replace(/position\s*:\s*fixed\b/gi, "position:static")
    out = out.replace(/z-index\s*:\s*([0-9]+)\s*;?/gi, (m, n: string) => {
      const z = Number.parseInt(n, 10)
      if (Number.isFinite(z) && z > 9000) {
        return "z-index:9000;"
      }
      return m
    })
    out = out.replace(/expression\s*\(/gi, "blocked(")
    out = out.replace(/javascript\s*:/gi, "")
    out = out.replace(/-moz-binding/gi, "")
    return out
  }
}
