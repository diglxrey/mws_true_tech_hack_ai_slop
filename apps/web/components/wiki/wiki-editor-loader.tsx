"use client"

import dynamic from "next/dynamic"
import type { WikiPageRow } from "@/lib/wiki-types"

const WikiEditor = dynamic(
  () => import("./wiki-editor").then((m) => ({ default: m.WikiEditor })),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading editor…</div> },
)

interface Props {
  pageId: string
  initialPage: WikiPageRow | null
}

export function WikiEditorLoader({ pageId, initialPage }: Props) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <WikiEditor key={pageId} pageId={pageId} initialPage={initialPage} />
    </div>
  )
}
