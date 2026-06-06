import { auth } from "@/auth"
import { NextResponse, type NextRequest } from "next/server"

/**
 * GET /api/auth/ws-token
 * Returns the current access token for use with WebSocket connections
 * (which cannot set custom headers — we pass the token as a subprotocol).
 * This endpoint is only reachable server-side; the token is short-lived.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.accessToken) {
    return new NextResponse(null, { status: 401 })
  }
  return NextResponse.json({ token: session.accessToken })
}
