"use client"

import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { api } from "@/lib/api"
import type { FusionNode, WikiMwsBlockConfig } from "@/lib/wiki-types"
import { useTranslations } from "next-intl"

const RECORDS_PER_PAGE_OPTIONS = [10, 20, 50] as const

interface Props {
  pageId: string
  blockId: string
  open: boolean
  onClose: () => void
  onSave?: (config: WikiMwsBlockConfig) => void
}

export function WikiMwsBlockConfigDialog({ pageId, blockId, open, onClose, onSave }: Props) {
  const t = useTranslations("mwsConfig")
  const [datasheets, setDatasheets] = useState<FusionNode[]>([])
  const [dstId, setDstId] = useState("")
  const [viewId, setViewId] = useState("")
  const [filterByFormula, setFilterByFormula] = useState("")
  const [pageSize, setPageSize] = useState<(typeof RECORDS_PER_PAGE_OPTIONS)[number]>(50)
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [allowEditBack, setAllowEditBack] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void api.wiki.listMwsDatasheets().then((nodes) => {
      const sheets = nodes.filter((n) => n.type === "Datasheet" || n.type === "datasheet")
      setDatasheets(sheets)
    })
    void api.wiki.getMwsBlockConfig(pageId, blockId).then((cfg) => {
      if (cfg) {
        setDstId(cfg.dst_id)
        setViewId(cfg.view_id ?? "")
        setFilterByFormula(cfg.filter_by_formula ?? "")
        setPageSize(
          cfg.page_size === 10 || cfg.page_size === 20 || cfg.page_size === 50 ? cfg.page_size : 50,
        )
        setRefreshInterval(cfg.refresh_interval_secs)
        setAllowEditBack(cfg.allow_edit_back)
      }
    }).catch(() => { /* no config yet */ })
  }, [open, pageId, blockId])

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await api.wiki.putMwsBlockConfig(pageId, blockId, {
        dst_id: dstId,
        view_id: viewId || undefined,
        filter_by_formula: filterByFormula || undefined,
        page_size: pageSize,
        refresh_interval_secs: refreshInterval,
        allow_edit_back: allowEditBack,
      } as WikiMwsBlockConfig)
      onSave?.(saved)
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("saveError"))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold">{t("title")}</h2>

        <div className="space-y-4">
          <div>
            <Label className="mb-1">{t("datasheet")}</Label>
            {datasheets.length > 0 && (
              <select
                value={datasheets.some((d) => d.id === dstId) ? dstId : ""}
                onChange={(e) => setDstId(e.target.value)}
                className="w-full rounded border bg-background px-3 py-2 text-sm"
              >
                <option value="">{t("selectDatasheet")}</option>
                {datasheets.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
            <Input
              className={datasheets.length > 0 ? "mt-1 text-xs" : ""}
              placeholder={datasheets.length > 0 ? t("enterIdDirectly") : t("enterDstId")}
              value={dstId}
              onChange={(e) => setDstId(e.target.value)}
            />
          </div>

          <div>
            <Label className="mb-1">{t("viewId")}</Label>
            <Input
              value={viewId}
              onChange={(e) => setViewId(e.target.value)}
              placeholder="viwXXX"
            />
          </div>

          <div>
            <Label className="mb-1">{t("filterFormula")}</Label>
            <Input
              value={filterByFormula}
              onChange={(e) => setFilterByFormula(e.target.value)}
              placeholder='AND({Status}="Active")'
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <Label className="mb-1">{t("recordsPerPage")}</Label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value) as (typeof RECORDS_PER_PAGE_OPTIONS)[number])}
                className="w-full rounded border bg-background px-3 py-2 text-sm"
              >
                {RECORDS_PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <Label className="mb-1">{t("refreshInterval")}</Label>
              <Input
                type="number"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                min={10}
                max={300}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={allowEditBack}
              onChange={(e) => setAllowEditBack(e.target.checked)}
            />
            {t("allowEdit")}
          </label>
        </div>

        {saveError && (
          <p className="mt-3 text-xs text-destructive">{saveError}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={() => void handleSave()} disabled={saving || !dstId}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </div>
  )
}
