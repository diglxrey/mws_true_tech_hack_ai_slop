import Link from "next/link"
import { getTranslations } from "next-intl/server"

export default async function WikiIndexPage() {
  const t = await getTranslations("wiki")

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-4xl">📝</div>
      <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("createCollaborate")}
      </p>
      <Link
        href="/wiki/graph"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        {t("viewPageGraph")}
      </Link>
    </div>
  )
}
