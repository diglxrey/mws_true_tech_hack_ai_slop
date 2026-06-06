/** WebSocket close code used when the server rejects a connection (e.g. missing/invalid token). */
export const WS_CLOSE_UNAUTHORIZED = 4401

/**
 * Returns base WebSocket origin for wiki collab.
 * Call getWikiCollabToken() to retrieve the access token separately
 * (used in WebSocket subprotocol: new WebSocket(url, ["bearer", token])).
 */
export function getWikiCollabWsUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
  return apiUrl
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://")
    .replace(/\/+$/, "")
}

export async function getWikiCollabToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/ws-token", { credentials: "include" })
    if (res.ok) {
      const data = await res.json() as { token?: string }
      return data.token ?? null
    }
  } catch {
    // network error
  }
  return null
}
