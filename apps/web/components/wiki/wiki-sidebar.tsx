"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { PlusIcon, FileTextIcon, ChevronRightIcon, Trash2Icon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { api } from "@/lib/api"
import type { WikiPageRow } from "@/lib/wiki-types"
import { cn } from "@workspace/ui/lib/utils"
import { useTranslations } from "next-intl"

const WIKI_PAGE_TITLE_UPDATED_EVENT = "wiki:page-title-updated"

export function WikiSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations("wiki")
  const [pages, setPages] = useState<WikiPageRow[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  /** Page id whose row shows the delete control after clicking the page row */
  const [armedPageId, setArmedPageId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    void api.wiki.listPages().then(setPages).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function onPageTitleUpdated(event: Event) {
      const customEvent = event as CustomEvent<{ pageId: string; title: string }>
      const detail = customEvent.detail
      if (!detail?.pageId) return

      setPages((prev) =>
        prev.map((page) =>
          page.id === detail.pageId
            ? { ...page, title: detail.title || t("untitled") }
            : page,
        ),
      )
    }

    window.addEventListener(WIKI_PAGE_TITLE_UPDATED_EVENT, onPageTitleUpdated)
    return () => window.removeEventListener(WIKI_PAGE_TITLE_UPDATED_EVENT, onPageTitleUpdated)
  }, [])

  const filtered = search.trim()
    ? pages.filter((p) =>
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.slug.toLowerCase().includes(search.toLowerCase()),
      )
    : pages

  async function createPage() {
    const slug = `page-${Date.now()}`
    const page = await api.wiki.createPage({ slug, title: t("untitled") })
    setPages((prev) => [...prev, page])
    router.push(`/wiki/${page.id}`)
  }

  const deletePage = useCallback(
    async (page: WikiPageRow) => {
      if (
        !window.confirm(
          t("deleteConfirm", { title: page.title || t("untitled") }),
        )
      ) {
        return
      }
      setDeletingId(page.id)
      try {
        await api.wiki.deletePage(page.id)
        setPages((prev) => prev.filter((p) => p.id !== page.id))
        setArmedPageId((id) => (id === page.id ? null : id))
        if (pathname === `/wiki/${page.id}`) {
          router.push("/wiki")
        }
      } catch (e) {
        window.alert(e instanceof Error ? e.message : t("deleteFailed"))
      } finally {
        setDeletingId(null)
      }
    },
    [pathname, router, t],
  )

  useEffect(() => {
    if (!armedPageId) return
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setArmedPageId(null)
        return
      }
      if (e.key === "Delete") {
        e.preventDefault()
        const page = pages.find((p) => p.id === armedPageId)
        if (page) void deletePage(page)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [armedPageId, pages, deletePage])

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">{t("title")}</span>
        <Button variant="ghost" size="icon-xs" onClick={() => void createPage()} title={t("newPage")}>
          <PlusIcon className="size-4 text-muted-foreground" />
        </Button>
      </div>

      <div className="px-3 py-2">
        <Input
          placeholder={t("searchPages")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm border-border bg-muted placeholder:text-muted-foreground"
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-1 pb-4">
        {loading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{t("loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {search ? t("noResults") : t("noPages")}
          </p>
        ) : (
          filtered.map((page) => {
            const href = `/wiki/${page.id}`
            const active = pathname === href
            const armed = armedPageId === page.id
            return (
              <div
                key={page.id}
                className={cn(
                  "flex min-w-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-muted transition-colors",
                  active && "bg-muted font-medium",
                )}
                title={t("clickToDelete")}
                aria-pressed={armed}
                onClick={() =>
                  setArmedPageId((id) => (id === page.id ? null : page.id))
                }
              >
                <div
                  className="pointer-events-none flex size-7 shrink-0 items-center justify-center rounded-md text-foreground"
                  aria-hidden
                >
                  {page.icon ? (
                    <span className="text-base leading-none">{page.icon}</span>
                  ) : (
                    <FileTextIcon className="size-4 shrink-0 text-primary" />
                  )}
                </div>
                <Link
                  href={href}
                  className="min-w-0 flex-1 truncate py-1"
                >
                  {page.title || t("untitled")}
                </Link>
                {armed ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    title={t("deletePage")}
                    aria-label={t("deletePage")}
                    disabled={deletingId === page.id}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void deletePage(page)
                    }}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                ) : null}
              </div>
            )
          })
        )}
      </nav>

      <div className="border-t border-border px-3 py-2">
        <Link
          href="/wiki/graph"
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            pathname === "/wiki/graph" && "bg-muted text-foreground",
          )}
        >
          <ChevronRightIcon className="size-3.5" />
          {t("pageGraph")}
        </Link>
      </div>
    </aside>
  )
}
