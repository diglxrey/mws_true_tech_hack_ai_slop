import { auth } from "@/auth"
import { normalizeCallbackUrl } from "@/lib/callback-url"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

/** `auth()` wrapper augments the request with session data (see next-auth middleware). */
type AuthedNextRequest = NextRequest & { auth: unknown }

export default auth((req: AuthedNextRequest) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  // API routes — let through (BFF proxy handles token injection; returns 401 if no session)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  // Guest on /login — show page (must run before !isLoggedIn redirect)
  if (pathname === "/login" && !isLoggedIn) {
    return NextResponse.next()
  }

  // Already logged in on /login → redirect to callbackUrl or home
  if (isLoggedIn && pathname === "/login") {
    const raw = req.nextUrl.searchParams.get("callbackUrl") ?? "/"
    const safe = normalizeCallbackUrl(raw, req.nextUrl.origin)
    return NextResponse.redirect(new URL(safe, req.nextUrl.origin))
  }

  // Not logged in on a page route → redirect to login
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin)
    const cb = normalizeCallbackUrl(req.nextUrl.pathname, req.nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", cb)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  // Match page routes except Next internals and static assets (/login included so guests vs session logic runs)
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
