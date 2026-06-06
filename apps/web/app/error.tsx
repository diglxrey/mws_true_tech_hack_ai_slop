"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations("error")

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="bg-background p-8 font-sans text-foreground">
      <h2 className="mb-2">{t("title")}</h2>
      <p className="mb-4 text-muted-foreground">{error.message}</p>
      <button
        onClick={reset}
        className="cursor-pointer rounded bg-primary px-4 py-2 text-primary-foreground border-none"
      >
        {t("tryAgain")}
      </button>
    </div>
  )
}
