import type { getTranslations } from "next-intl/server"

export type HomeLinkItem = {
  title: string
  description: string
  /** Navigation target */
  href: string
  /** Shown under the title (path or full URL) */
  displayUrl: string
  /** Use <a> instead of Next Link */
  external?: boolean
}

type HomeTranslator = Awaited<ReturnType<typeof getTranslations<"home">>>

/** Entry points for the link list on the home page. */
export function buildHomeLinks(t: HomeTranslator): HomeLinkItem[] {
  return [
    {
      title: t("links.wiki.title"),
      href: "/wiki",
      displayUrl: "/wiki",
      description: t("links.wiki.description"),
    },
    {
      title: t("links.graph.title"),
      href: "/wiki/graph",
      displayUrl: "/wiki/graph",
      description: t("links.graph.description"),
    },
  ]
}
