"use client"

import { useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@workspace/ui/components/button"
import { useRouter } from "next/navigation"

type Locale = "en" | "ru"
const LOCALE_COOKIE = "NEXT_LOCALE"

export function LanguageSwitcher() {
  const t = useTranslations("language")
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const next: Locale = locale === "en" ? "ru" : "en"
    startTransition(() => {
      document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
      router.refresh()
    })
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} disabled={isPending} title={t("switch")}>
      {locale === "en" ? t("ru") : t("en")}
    </Button>
  )
}
