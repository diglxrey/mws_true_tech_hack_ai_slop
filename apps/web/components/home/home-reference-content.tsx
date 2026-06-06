import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"

function InlineCode({ children }: { children: ReactNode }) {
  return <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.9em] text-foreground">{children}</code>
}

export async function HomeReferenceContent() {
  const t = await getTranslations("home.reference")

  return (
    <div className="font-serif text-[15px] leading-relaxed text-muted-foreground">
      <h2 className="font-sans text-base font-semibold text-foreground">{t("whatHappensTitle")}</h2>
      <p className="mt-3">
        {t.rich("whatHappensIntro", {
          strong: (chunks) => <strong className="text-foreground/90 font-medium">{chunks}</strong>,
        })}
      </p>

      <section className="mt-8">
        <h3 className="font-sans text-sm font-semibold text-foreground">{t("mwsTitle")}</h3>
        <p className="mt-2">{t("mwsBody")}</p>
      </section>

      <section className="mt-8">
        <h3 className="font-sans text-sm font-semibold text-foreground">{t("wikiPagesTitle")}</h3>
        <p className="mt-2">
          {t.rich("wikiPagesBody", {
            code: (chunks) => <InlineCode>{chunks}</InlineCode>,
          })}
        </p>
      </section>

      <section className="mt-8">
        <h3 className="font-sans text-sm font-semibold text-foreground">{t("tableBlockTitle")}</h3>
        <p className="mt-2">{t("tableBlockBody")}</p>
        <p className="mt-2 text-sm">
          {t.rich("tableBlockHint", {
            code: (chunks) => <InlineCode>{chunks}</InlineCode>,
          })}
        </p>
      </section>

      <section className="mt-8">
        <h3 className="font-sans text-sm font-semibold text-foreground">{t("savingTitle")}</h3>
        <p className="mt-2">{t("savingBody")}</p>
      </section>

      <section className="mt-8">
        <h3 className="font-sans text-sm font-semibold text-foreground">{t("slashMenuTitle")}</h3>
        <p className="mt-2">
          {t.rich("slashMenuBody", {
            code: (chunks) => <InlineCode>{chunks}</InlineCode>,
          })}
        </p>
      </section>

      <section className="mt-8">
        <h3 className="font-sans text-sm font-semibold text-foreground">{t("hotkeysTitle")}</h3>
        <p className="mt-2">{t("hotkeysIntro")}</p>
        <div className="mt-3 overflow-x-auto font-sans">
          <table className="border-border w-full min-w-[320px] border-collapse border text-sm text-foreground">
            <thead>
              <tr>
                <th className="border-border bg-muted/50 border px-3 py-2 text-left font-medium">
                  {t("hotkeysColShortcut")}
                </th>
                <th className="border-border bg-muted/50 border px-3 py-2 text-left font-medium">{t("hotkeysColAction")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-border border px-3 py-2 font-mono text-xs">{t("hotkeysRow1Shortcut")}</td>
                <td className="border-border border px-3 py-2 text-muted-foreground">{t("hotkeysRow1Desc")}</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2 font-mono text-xs">{t("hotkeysRow2Shortcut")}</td>
                <td className="border-border border px-3 py-2 text-muted-foreground">{t("hotkeysRow2Desc")}</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2 font-mono text-xs">{t("hotkeysRow3Shortcut")}</td>
                <td className="border-border border px-3 py-2 text-muted-foreground">{t("hotkeysRow3Desc")}</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2 font-mono text-xs">{t("hotkeysRow4Shortcut")}</td>
                <td className="border-border border px-3 py-2 text-muted-foreground">{t("hotkeysRow4Desc")}</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2 font-mono text-xs">{t("hotkeysRow5Shortcut")}</td>
                <td className="border-border border px-3 py-2 text-muted-foreground">{t("hotkeysRow5Desc")}</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2 font-mono text-xs">{t("hotkeysRow6Shortcut")}</td>
                <td className="border-border border px-3 py-2 text-muted-foreground">{t("hotkeysRow6Desc")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h3 className="font-sans text-sm font-semibold text-foreground">{t("linksAndTagsTitle")}</h3>
        <p className="mt-2">{t("linksAndTagsBody")}</p>
      </section>
    </div>
  )
}
