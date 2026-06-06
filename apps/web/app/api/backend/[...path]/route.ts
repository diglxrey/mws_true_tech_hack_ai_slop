/**
 * BFF proxy — forwards all /api/backend/* requests to the NestJS API
 * with the session access token injected as Authorization: Bearer.
 *
 * This keeps tokens server-side (http-only cookie via Auth.js) and
 * eliminates the need for CORS credentials on the API.
 */
import { auth } from "@/auth"
import { type NextRequest, NextResponse } from "next/server"

const API_URL = (process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")

// Strip the /api/backend prefix to get the real API path
function getApiPath(req: NextRequest): string {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api\/backend/, "")
  return `${API_URL}${path}${url.search}`
}

async function proxyRequest(req: NextRequest): Promise<Response> {
  const session = await auth()

  if (!session?.accessToken) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const headers = new Headers(req.headers)
  headers.delete("host")
  headers.delete("connection")
  headers.set("Authorization", `Bearer ${session.accessToken}`)

  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined

  return fetch(getApiPath(req), {
    method: req.method,
    headers,
    body,
    // @ts-expect-error -- Node 18+ fetch supports duplex
    duplex: body ? "half" : undefined,
  })
}

export async function GET(req: NextRequest) {
  const res = await proxyRequest(req)
  return new NextResponse(res.body, {
    status: res.status,
    headers: res.headers,
  })
}

export async function POST(req: NextRequest) {
  const res = await proxyRequest(req)
  return new NextResponse(res.body, {
    status: res.status,
    headers: res.headers,
  })
}

export async function PUT(req: NextRequest) {
  const res = await proxyRequest(req)
  return new NextResponse(res.body, {
    status: res.status,
    headers: res.headers,
  })
}

export async function PATCH(req: NextRequest) {
  const res = await proxyRequest(req)
  return new NextResponse(res.body, {
    status: res.status,
    headers: res.headers,
  })
}

export async function DELETE(req: NextRequest) {
  const res = await proxyRequest(req)
  return new NextResponse(res.body, {
    status: res.status,
    headers: res.headers,
  })
}
