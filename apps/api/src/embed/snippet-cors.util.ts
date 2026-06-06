/**
 * HTML embed CORS: `allowed_origins` `["*"]` → `*`; explicit origins must match `Origin` header.
 */
export function corsHeadersForSnippet(
  allowedOrigins: string[],
  requestOrigin: string | undefined,
): Record<string, string> {
  if (allowedOrigins.length === 0) {
    return {}
  }
  if (allowedOrigins.includes("*")) {
    return { "Access-Control-Allow-Origin": "*" }
  }
  if (!requestOrigin) {
    return {}
  }
  if (allowedOrigins.includes(requestOrigin)) {
    return { "Access-Control-Allow-Origin": requestOrigin, Vary: "Origin" }
  }
  try {
    const host = new URL(requestOrigin).hostname
    for (const a of allowedOrigins) {
      if (a === requestOrigin) {
        return { "Access-Control-Allow-Origin": requestOrigin, Vary: "Origin" }
      }
      if (!a.includes("://") && a === host) {
        return { "Access-Control-Allow-Origin": requestOrigin, Vary: "Origin" }
      }
    }
  } catch {
    /* ignore */
  }
  return {}
}
