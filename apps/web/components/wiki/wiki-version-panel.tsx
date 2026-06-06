"use client"

import { useEffect, useState } from "react"
import * as Y from "yjs"
import { XIcon, PlusIcon, RotateCcwIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { api } from "@/lib/api"
import type { WikiVersionSummary } from "@/lib/wiki-types"
import { useTranslations } from "next-intl"

interface Props {
  pageId: string
  ydoc: Y.Doc
  onClose: () => void
}

export function WikiVersionPanel({ pageId, ydoc, onClose }: Props) {
  const t = useTranslations("versions")
  const [versions, setVersions] = useState<WikiVersionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  useEffect(() => {
    void api.wiki.listVersions(pageId).then(setVersions).finally(() => setLoading(false))
  }, [pageId])

  async function createVersion() {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const v = await api.wiki.createVersion(pageId, newLabel || undefined)
      setVersions((prev) => [v, ...prev])
      setNewLabel("")
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("saveError"))
    } finally {
      setSaving(false)
    }
  }

  async function restoreVersion(versionId: string) {
    if (restoring) return
    setRestoring(versionId)
    setRestoreError(null)
    try {
      const result = await api.wiki.restoreVersion(pageId, versionId)
      if (result.restored) {
        // Reload the full version and apply to ydoc
        const full = await api.wiki.getVersion(pageId, versionId)
        const buf = Buffer.from(full.ydoc_state_b64, "base64")
        Y.applyUpdate(ydoc, new Uint8Array(buf))
        // Refresh versions list (backup version was created)
        const updated = await api.wiki.listVersions(pageId)
        setVersions(updated)
      }
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : t("restoreError"))
    } finally {
      setRestoring(null)
    }
  }

  return (
    <aside className="flex h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden border-l border-border bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <XIcon className="size-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Create version */}
      <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">{t("checkpoint")}</p>
        <div className="flex min-w-0 gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t("placeholder")}
            className="h-8 min-w-0 flex-1 text-xs border-border placeholder:text-muted-foreground/60"
            onKeyDown={(e) => { if (e.key === "Enter") void createVersion() }}
          />
          <Button size="sm" onClick={() => void createVersion()} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <PlusIcon className="size-3.5" />
          </Button>
        </div>
        {saveError && (
          <p className="text-xs text-destructive">{saveError}</p>
        )}
      </div>

      {/* Version list */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-4">
        {restoreError && (
          <p className="text-xs text-destructive">{restoreError}</p>
        )}
        {loading && <p className="text-xs text-muted-foreground">{t("loading")}</p>}
        {!loading && versions.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        )}
        {versions.map((v) => (
          <div key={v.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">
                  {v.label ?? t("version", { num: v.version_num })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(v.created_at).toLocaleString()} · {v.created_by}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                title={t("restore")}
                disabled={restoring === v.id}
                onClick={() => void restoreVersion(v.id)}
              >
                <RotateCcwIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
