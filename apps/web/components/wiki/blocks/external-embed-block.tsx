"use client"

import { useState } from "react"
import { createReactBlockSpec } from "@blocknote/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { detectEmbedProvider, toEmbedViewModel } from "@/lib/embed-providers"

function ExternalEmbedRenderer({
  block,
  editor,
}: {
  block: { id: string; props: { url: string; embedType: string; height: number } }
  editor: { updateBlock: (block: unknown, update: unknown) => void }
}) {
  const { url, height } = block.props
  const [inputUrl, setInputUrl] = useState(url)
  const viewModel = toEmbedViewModel(url)

  function applyUrl() {
    const parsed = (() => {
      try {
        return new URL(inputUrl.trim())
      } catch {
        return null
      }
    })()

    const embedType = parsed ? detectEmbedProvider(parsed) : "invalid"
    editor.updateBlock(block, {
      props: { ...block.props, url: inputUrl.trim(), embedType },
    })
  }

  if (!url) {
    return (
      <div className="rounded border border-dashed p-4 text-center text-sm" contentEditable={false}>
        <p className="mb-2 text-muted-foreground">Embed block — paste video, map, image, or any link URL</p>
        <div className="flex gap-2 justify-center">
          <Input
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="https://…"
            className="h-7 w-64 text-xs"
            onKeyDown={(e) => { if (e.key === "Enter") applyUrl() }}
          />
          <Button variant="outline" size="sm" onClick={applyUrl}>
            Embed
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded border overflow-hidden relative w-[100vw] left-1/2 -translate-x-1/2 max-w-[100vw]" contentEditable={false}>
      <div className="flex items-center justify-between px-3 py-1 bg-muted/50 border-b text-xs text-muted-foreground">
        <span className="truncate max-w-[320px]">{viewModel.label}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            editor.updateBlock(block, { props: { ...block.props, url: "" } })
          }}
        >
          ×
        </Button>
      </div>
      {viewModel.kind === "youtube" && viewModel.embedSrc && (
        <div className="aspect-video w-full bg-black/95">
          <iframe
            src={viewModel.embedSrc}
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            className="h-full w-full border-0"
            loading="lazy"
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      )}
      {viewModel.kind === "figma" && viewModel.embedSrc && (
        <iframe
          src={viewModel.embedSrc}
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="w-full border-0"
          style={{ height: `${height || 480}px` }}
          loading="lazy"
          title="Figma embed"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      {(viewModel.kind === "googleMaps" || viewModel.kind === "vkVideo" || viewModel.kind === "rutube") && viewModel.embedSrc && (
        <iframe
          src={viewModel.embedSrc}
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          className="w-full border-0"
          style={{ height: `${height || 460}px` }}
          loading="lazy"
          title={viewModel.label}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      )}
      {viewModel.kind === "image" && viewModel.imageSrc && (
        <div className="bg-muted/50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewModel.imageSrc}
            alt="Embedded media"
            className="mx-auto max-h-[70vh] w-auto max-w-full rounded object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      {viewModel.kind === "link" && viewModel.resolvedUrl && (
        <div className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            {viewModel.faviconSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewModel.faviconSrc}
                alt=""
                aria-hidden="true"
                className="size-4 rounded-sm"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            )}
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {viewModel.domain}
            </p>
          </div>
          <a
            href={viewModel.resolvedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm text-primary underline-offset-2 hover:underline"
          >
            {viewModel.resolvedUrl}
          </a>
        </div>
      )}
      {viewModel.kind === "invalid" && (
        <div className="p-4 text-sm text-muted-foreground">
          Enter a valid URL starting with http:// or https://.
        </div>
      )}
    </div>
  )
}

export const ExternalEmbedBlockSpec = createReactBlockSpec(
  {
    type: "externalEmbed" as const,
    propSchema: {
      url: { default: "" },
      embedType: { default: "iframe" },
      height: { default: 400 },
    },
    content: "none",
  },
  {
    render: (props) => (
      <ExternalEmbedRenderer
        block={props.block as { id: string; props: { url: string; embedType: string; height: number } }}
        editor={props.editor as { updateBlock: (block: unknown, update: unknown) => void }}
      />
    ),
  },
)
