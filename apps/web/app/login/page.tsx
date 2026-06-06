import { LoginClient } from "@/app/login/login-client"
import { headers } from "next/headers"
import { Suspense } from "react"

export default async function LoginPage() {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? "http"
  const origin = `${proto}://${host}`

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      }
    >
      <LoginClient origin={origin} />
    </Suspense>
  )
}
