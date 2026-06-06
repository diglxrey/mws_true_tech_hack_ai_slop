"use client"

import { signOut, useSession } from "next-auth/react"
import { useTranslations } from "next-intl"
import { Button } from "@workspace/ui/components/button"
import { LanguageSwitcher } from "@/components/language-switcher"

export function AuthHeader() {
  const { data: session } = useSession()
  const t = useTranslations("auth")

  if (!session?.user) return null

  return (
    <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm">
      <span className="text-muted-foreground flex-1">{session.user.email ?? session.user.name}</span>
      <LanguageSwitcher />
      <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
        {t("signOut")}
      </Button>
    </div>
  )
}
