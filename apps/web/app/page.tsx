import Link from "next/link"
import { getTranslations } from "next-intl/server"

import { HomeReferenceContent } from "@/components/home/home-reference-content"
import { buildHomeLinks } from "@/components/home/home-links"

export default async function Page() {
  const t = await getTranslations("home")
  const links = buildHomeLinks(t)

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-8">
      <div className="mb-8 max-w-xl text-center">
        <h1 className="text-foreground text-5xl font-bold tracking-tight sm:text-6xl">
          {t.rich("heroTitle", {
            primary: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{t("heroSubtitle")}</p>
      </div>

      <div className="border-border bg-card text-card-foreground w-full max-w-3xl rounded-xl border p-6 shadow-sm sm:p-8">
        <section>
          <h2 className="text-foreground text-sm font-semibold tracking-wide uppercase">{t("startHeading")}</h2>
          <ul className="mt-5 space-y-6">
            {links.map((item) => (
              <li key={item.href + item.title}>
                <div className="text-foreground text-base font-medium">
                  {item.external ? (
                    <a href={item.href} className="text-primary hover:underline" rel="noopener noreferrer" target="_blank">
                      {item.title}
                    </a>
                  ) : (
                    <Link href={item.href} className="text-primary hover:underline">
                      {item.title}
                    </Link>
                  )}
                </div>
                <div className="text-muted-foreground mt-1 font-mono text-xs break-all">{item.displayUrl}</div>
                <p className="text-foreground/90 mt-2 text-sm leading-relaxed">{item.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="border-border mt-8 border-t pt-8">
          <HomeReferenceContent />
        </div>
      </div>

      <p className="text-muted-foreground mt-8 text-center text-xs">
        {t.rich("themeHint", {
          kbd: (chunks) => (
            <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-[0.7rem]">{chunks}</kbd>
          ),
        })}
      </p>
    </div>
  )
}
