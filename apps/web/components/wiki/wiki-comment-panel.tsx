"use client"

import { useEffect, useState } from "react"
import { XIcon, CheckCircleIcon, MessageSquareIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { api } from "@/lib/api"
import type { WikiComment } from "@/lib/wiki-types"
import { cn } from "@workspace/ui/lib/utils"
import { useTranslations } from "next-intl"

interface Props {
  pageId: string
  onClose: () => void
}

export function WikiCommentPanel({ pageId, onClose }: Props) {
  const t = useTranslations("comments")
  const [comments, setComments] = useState<WikiComment[]>([])
  const [newBody, setNewBody] = useState("")
  const [loading, setLoading] = useState(true)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState("")

  useEffect(() => {
    void api.wiki.getComments(pageId).then(setComments).finally(() => setLoading(false))
  }, [pageId])

  async function addComment() {
    if (!newBody.trim()) return
    // Note: block_id is optional in the API and defaults to "page" for page-level comments
    const comment = await api.wiki.createComment(pageId, {
      body: newBody,
    })
    setComments((prev) => [...prev, comment])
    setNewBody("")
  }

  async function addReply(parentId: string) {
    if (!replyBody.trim()) return
    // Note: block_id is optional in the API and defaults to "page" for page-level comments
    const comment = await api.wiki.createComment(pageId, {
      body: replyBody,
      parent_id: parentId,
    })
    setComments((prev) => [...prev, comment])
    setReplyBody("")
    setReplyTo(null)
  }

  async function resolve(commentId: string) {
    await api.wiki.updateComment(pageId, commentId, { resolved: true })
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, resolved: true } : c)),
    )
  }

  const topLevel = comments.filter((c) => !c.parent_id)
  const replies = (parentId: string) => comments.filter((c) => c.parent_id === parentId)

  return (
    <aside className="flex h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden border-l border-border bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <XIcon className="size-4 text-muted-foreground" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-4">
        {loading && <p className="text-xs text-muted-foreground">{t("loading")}</p>}
        {!loading && topLevel.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        )}

        {topLevel.map((comment) => (
          <div
            key={comment.id}
            className={cn(
              "min-w-0 rounded-lg border border-border p-3 text-sm",
              comment.resolved && "opacity-50",
            )}
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="break-words font-medium text-foreground">{comment.author}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(comment.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              {!comment.resolved && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  title="Resolve"
                  onClick={() => void resolve(comment.id)}
                >
                  <CheckCircleIcon className="size-3.5 text-muted-foreground" />
                </Button>
              )}
            </div>
            <p className="mt-1 break-words text-[13px] leading-5 text-foreground">{comment.body}</p>

            {/* Replies */}
            {replies(comment.id).map((r) => (
              <div key={r.id} className="mt-2 ml-3 rounded border-l-2 border-primary/30 pl-2 text-xs">
                <span className="font-medium text-foreground">{r.author}:</span> <span className="text-foreground">{r.body}</span>
              </div>
            ))}

            {/* Reply input */}
            {replyTo === comment.id ? (
              <div className="mt-2 flex min-w-0 flex-col gap-2">
                <Textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Reply…"
                  className="min-h-[3.5rem] w-full min-w-0 resize-none text-xs border-border placeholder:text-muted-foreground/60"
                />
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)} className="text-muted-foreground">
                    {t("cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void addReply(comment.id)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {t("send")}
                  </Button>
                </div>
              </div>
            ) : (
              !comment.resolved && (
                <button
                  className="mt-1 text-xs text-primary hover:text-primary/80 font-medium"
                  onClick={() => setReplyTo(comment.id)}
                >
                  {t("reply")}
                </button>
              )
            )}
          </div>
        ))}
      </div>

      {/* New comment input — pinned to bottom of panel */}
      <div className="shrink-0 space-y-2 border-t border-border bg-background p-4">
        <Textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder={t("placeholder")}
          className="h-20 w-full min-w-0 resize-none text-sm border-border placeholder:text-muted-foreground/60"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) void addComment()
          }}
        />
        <div className="flex shrink-0 justify-end">
          <Button
            size="sm"
            onClick={() => void addComment()}
            disabled={!newBody.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <MessageSquareIcon className="mr-1 size-3.5" />
            {t("submit")}
          </Button>
        </div>
      </div>
    </aside>
  )
}
