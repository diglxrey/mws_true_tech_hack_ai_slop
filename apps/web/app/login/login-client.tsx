"use client"

import { normalizeCallbackUrl } from "@/lib/callback-url"
import { Button } from "@workspace/ui/components/button"
import { signIn } from "next-auth/react"
import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { LanguageSwitcher } from "@/components/language-switcher"

export function LoginClient({ origin }: { origin: string }) {
  const searchParams = useSearchParams()
  const t = useTranslations("auth")
  const callbackUrl = useMemo(() => {
    const raw = searchParams.get("callbackUrl") ?? "/"
    return normalizeCallbackUrl(raw, origin)
  }, [searchParams, origin])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-6 p-8">
        <h1 className="text-2xl font-semibold">{t("appName")}</h1>
        <p className="text-muted-foreground text-sm">{t("signIn")}</p>
        <Button onClick={() => signIn("dex", { callbackUrl })}>{t("signInWithDex")}</Button>
        <LanguageSwitcher />
      </div>
    </div>
  )
}
