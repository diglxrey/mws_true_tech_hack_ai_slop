"use client"

import { useRef, useState } from "react"
import type { BlockNoteEditor } from "@blocknote/core"
import { XIcon, SparklesIcon, CheckIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { api, type WikiAiSuggestStreamEvent } from "@/lib/api"
import { useTranslations } from "next-intl"

/** Total context budget (~50k) to stay under typical JSON body limits via BFF */
const WIKI_AI_CONTEXT_MAX_CHARS = 50_000

interface Props {
  editor: BlockNoteEditor
  pageTitle: string
  onClose: () => void
}

function buildWikiAiContext(editor: BlockNoteEditor, pageTitle: string): string {
  const sections: string[] = []
  sections.push(`## Page title\n${pageTitle}`)

  let docMd = ""
  try {
    docMd = editor.blocksToMarkdownLossy()
  } catch {
    docMd = ""
  }

  const reservedForMeta = 2500
  const maxDoc = Math.max(0, WIKI_AI_CONTEXT_MAX_CHARS - reservedForMeta)
  if (docMd.length > maxDoc) {
    docMd = `${docMd.slice(0, maxDoc)}\n\n[Document truncated for size limit]`
  }
  sections.push(`## Current page (markdown)\n${docMd || "(empty)"}`)

  const pos = editor.getTextCursorPosition()
  const block = pos?.block
  if (block) {
    let blockPreview = ""
    try {
      blockPreview = editor.blocksToMarkdownLossy([block])
    } catch {
      blockPreview = ""
    }
    sections.push(`## Cursor / active block\nType: ${block.type}\n${blockPreview || "(empty)"}`)
  }

  return sections.join("\n\n")
}

export function WikiAiFloatingMenu({ editor, pageTitle, onClose }: Props) {
  const t = useTranslations("ai")
  const [prompt, setPrompt] = useState("")
  const [preview, setPreview] = useState("")
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  function stopStream() {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  async function generate() {
    if (!prompt.trim() || streaming) return
    setPreview("")
    setStreaming(true)

    const context = buildWikiAiContext(editor, pageTitle)
    const ac = new AbortController()
    abortRef.current = ac

    const onEvent = (data: WikiAiSuggestStreamEvent) => {
      if (data.type === "token" && data.text) {
        setPreview((prev) => prev + data.text)
      } else if (data.type === "done" || data.type === "error") {
        setStreaming(false)
        abortRef.current = null
      }
    }

    try {
      await api.wiki.streamAiSuggestion({
        prompt: prompt.trim(),
        context,
        signal: ac.signal,
        onEvent,
      })
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function acceptSuggestion() {
    if (!preview.trim()) return
    const refBlock = editor.getTextCursorPosition().block

    let toInsert: Parameters<typeof editor.insertBlocks>[0]
    try {
      const parsed = editor.tryParseMarkdownToBlocks(preview)
      toInsert =
        parsed.length > 0
          ? parsed
          : preview
              .split("\n")
              .filter((l) => l.trim())
              .map((line) => ({
                type: "paragraph" as const,
                content: line,
              }))
    } catch {
      toInsert = preview
        .split("\n")
        .filter((l) => l.trim())
        .map((line) => ({
          type: "paragraph" as const,
          content: line,
        }))
    }

    try {
      editor.insertBlocks(toInsert, refBlock, "after")
    } catch {
      // fallback: insert at end
    }
    setPreview("")
    setPrompt("")
    onClose()
  }

  return (
    <div className="absolute bottom-4 right-4 z-50 w-96 rounded-xl border border-border bg-popover shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <XIcon className="size-4 text-muted-foreground" />
        </Button>
      </div>

      <div className="p-4 space-y-3">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("prompt")}
          className="h-20 resize-none text-sm border-border placeholder:text-muted-foreground/60"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) void generate()
          }}
        />

        {preview && (
          <div className="rounded-lg border border-border bg-muted p-3 max-h-48 overflow-y-auto">
            <p className="whitespace-pre-wrap text-xs text-foreground">{preview}</p>
            {streaming && (
              <span className="inline-block h-4 w-0.5 animate-pulse bg-foreground ml-0.5" />
            )}
          </div>
        )}

        <div className="flex justify-between gap-2">
          {streaming ? (
            <Button variant="outline" size="sm" onClick={stopStream} className="border-border text-muted-foreground">
              {t("stop")}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void generate()} disabled={!prompt.trim()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <SparklesIcon className="mr-1.5 size-3.5" />
              {t("generate")}
            </Button>
          )}
          {preview && !streaming && (
            <Button size="sm" onClick={acceptSuggestion} className="bg-primary hover:bg-primary/80 text-primary-foreground">
              <CheckIcon className="mr-1.5 size-3.5" />
              {t("accept")}
            </Button>
          )}
        </div>


        <p className="text-xs text-[#6d7482]">{t("hint")}</p>
      </div>
    </div>
  )
}
