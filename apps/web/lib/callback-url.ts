const DISALLOWED_PATHS = new Set(["/login", "/logout"])

/**
 * Safe post-auth redirect: same-origin only; /login and /logout become /.
 */
export function normalizeCallbackUrl(url: string, baseUrl: string): string {
  if (!url?.trim()) return "/"
  try {
    const parsed = new URL(url, baseUrl)
    const base = new URL(baseUrl)
    if (parsed.origin !== base.origin) return "/"
    if (DISALLOWED_PATHS.has(parsed.pathname)) return "/"
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return "/"
  }
}
