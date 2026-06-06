import { WikiEditorLoader } from "@/components/wiki/wiki-editor-loader"
import { api } from "@/lib/api"
import type { WikiPageRow } from "@/lib/wiki-types"

interface Props {
  params: Promise<{ pageId: string }>
}

export default async function WikiPageRoute({ params }: Props) {
  const { pageId } = await params

  let initialPage: WikiPageRow | null = null
  try {
    initialPage = await api.wiki.getPage(pageId)
  } catch {
    // page not found or API unavailable — editor handles gracefully
  }

  return <WikiEditorLoader pageId={pageId} initialPage={initialPage} />
}
