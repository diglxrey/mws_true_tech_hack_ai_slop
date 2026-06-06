"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { WikiPageGraph } from "@/components/wiki/wiki-page-graph"
import { api } from "@/lib/api"
import type { WikiGraphData, WikiGraphNode } from "@/lib/wiki-types"

export default function WikiGraphPage() {
  const router = useRouter()
  const t = useTranslations("graph")
  const [graphData, setGraphData] = useState<WikiGraphData | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    void api.wiki.getGraph().then(setGraphData)
  }, [])

  function handleNodeClick(node: WikiGraphNode) {
    setSelected(node.id)
    if (node.kind !== "tag") {
      router.push(`/wiki/${node.id}`)
    }
  }

  if (!graphData) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </div>
    )
  }

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    )
  }

  const pageCount = graphData.nodes.filter((node) => node.kind !== "tag").length
  const tagCount = graphData.nodes.filter((node) => node.kind === "tag").length

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-2 flex items-center gap-3">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <span className="text-xs text-muted-foreground">
          {t("pages", { count: pageCount })} · {t("tags", { count: tagCount })} · {t("links", { count: graphData.links.length })}
        </span>
      </div>
      <div className="flex-1">
        <WikiPageGraph
          data={graphData}
          selectedNodeId={selected}
          onNodeClick={handleNodeClick}
          className="w-full h-full"
        />
      </div>
    </div>
  )
}
