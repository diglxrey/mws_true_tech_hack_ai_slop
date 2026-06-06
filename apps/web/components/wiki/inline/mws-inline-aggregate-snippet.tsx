"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createReactInlineContentSpec } from "@blocknote/react"
import { CalculatorIcon, SigmaIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { api } from "@/lib/api"
import type {
  FusionField,
  FusionNode,
  WikiInlineMwsAggregateBinding,
  WikiMwsAggregationKind,
} from "@/lib/wiki-types"

interface SmartOption {
  value: string
  label: string
}

interface SmartInputProps {
  label: string
  value: string
  onChange: (next: string) => void
  options: SmartOption[]
  placeholder: string
  disabled?: boolean
}

function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map((item) => normalizeCellValue(item)).filter(Boolean).join(", ")
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function SmartInput({ label, value, onChange, options, placeholder, disabled }: SmartInputProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const filteredOptions = useMemo(() => {
    const query = value.trim().toLowerCase()
    if (!query) return options.slice(0, 30)
    return options
      .filter((option) => option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query))
      .slice(0, 30)
  }, [value, options])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!(event.target instanceof Node)) return
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="space-y-1" ref={rootRef}>
      <Label>{label}</Label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
        />
        {open && !disabled && (
          <div className="absolute z-[90] mt-1 max-h-52 w-full overflow-auto rounded-md border bg-background shadow-xl">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={`${label}-${option.value}`}
                  type="button"
                  className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted/60 last:border-b-0"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <span className="font-medium">{option.label}</span>
                  {option.value !== option.label ? <span className="ml-2 text-xs text-muted-foreground">{option.value}</span> : null}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No matches. You can still type your own value.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const AGG_OPTIONS: Array<{ kind: WikiMwsAggregationKind; title: string }> = [
  { kind: "count", title: "COUNT" },
  { kind: "median", title: "MEDIAN" },
  { kind: "min", title: "MIN" },
  { kind: "max", title: "MAX" },
  { kind: "avg", title: "AVG" },
  { kind: "mode", title: "MODE" },
]

function aggTitle(kind: WikiMwsAggregationKind): string {
  return AGG_OPTIONS.find((item) => item.kind === kind)?.title ?? kind.toUpperCase()
}

interface AggregateConfigModalProps {
  open: boolean
  initial: WikiInlineMwsAggregateBinding
  onClose: () => void
  lockBindingFields?: boolean
  onApply: (binding: WikiInlineMwsAggregateBinding) => Promise<void> | void
}

export function WikiMwsAggregateSnippetConfigModal({
  open,
  initial,
  onClose,
  lockBindingFields = false,
  onApply,
}: AggregateConfigModalProps) {
  const [datasheets, setDatasheets] = useState<FusionNode[]>([])
  const [fields, setFields] = useState<FusionField[]>([])
  const [dstId, setDstId] = useState(initial.dstId)
  const [viewId, setViewId] = useState(initial.viewId ?? "")
  const [column, setColumn] = useState(initial.column ?? "")
  const [filterByFormula, setFilterByFormula] = useState(initial.filterByFormula ?? "")
  const [kind, setKind] = useState<WikiMwsAggregationKind>(initial.kind)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDstId(initial.dstId)
    setViewId(initial.viewId ?? "")
    setColumn(initial.column ?? "")
    setFilterByFormula(initial.filterByFormula ?? "")
    setKind(initial.kind)
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    void api.wiki.listMwsDatasheets().then((nodes) => {
      setDatasheets(nodes.filter((node) => node.type.toLowerCase() === "datasheet"))
    }).catch(() => {
      setDatasheets([])
    })
  }, [open])

  useEffect(() => {
    if (!open || !dstId) return
    void api.wiki.getMwsFields(dstId, viewId || undefined).then(setFields).catch(() => setFields([]))
  }, [open, dstId, viewId])

  const datasheetOptions = useMemo<SmartOption[]>(
    () => datasheets.map((sheet) => ({ value: sheet.id, label: sheet.name })),
    [datasheets],
  )
  const columnOptions = useMemo<SmartOption[]>(
    () => fields.map((field) => ({ value: field.name, label: `${field.name} (${field.type})` })),
    [fields],
  )

  async function handleApply() {
    if (!dstId) {
      setError("Please select datasheet.")
      return
    }
    if (kind !== "count" && !column) {
      setError("Please select a column for this aggregation.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onApply({
        dstId,
        viewId: viewId || undefined,
        kind,
        column: kind === "count" ? undefined : column,
        filterByFormula: filterByFormula || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply aggregation snippet.")
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-xl rounded-xl border bg-background p-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-2">
          <CalculatorIcon className="size-4 text-violet-500" />
          <h3 className="text-base font-semibold">MWS Aggregation Snippet</h3>
        </div>

        <div className="grid gap-3">
          <SmartInput
            label="Datasheet"
            value={dstId}
            onChange={setDstId}
            options={datasheetOptions}
            placeholder="Select or type datasheet ID"
            disabled={lockBindingFields}
          />
          <div className="space-y-1">
            <Label>Aggregation</Label>
            <Select
              value={kind}
              disabled={lockBindingFields}
              onValueChange={(v) => setKind(v as WikiMwsAggregationKind)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGG_OPTIONS.map((option) => (
                  <SelectItem key={option.kind} value={option.kind}>{option.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SmartInput
            label="Column"
            value={column}
            onChange={setColumn}
            options={columnOptions}
            placeholder={kind === "count" ? "Not required for COUNT" : "Select or type column"}
            disabled={lockBindingFields || !dstId || kind === "count"}
          />
          <div className="space-y-1">
            <Label>View ID (optional)</Label>
            <Input
              value={viewId}
              onChange={(e) => setViewId(e.currentTarget.value)}
              placeholder="viwXXXX"
              disabled={lockBindingFields}
            />
          </div>
          <div className="space-y-1">
            <Label>Filter formula (optional)</Label>
            <Input
              value={filterByFormula}
              onChange={(e) => setFilterByFormula(e.currentTarget.value)}
              placeholder='AND({Status}="Active")'
              disabled={lockBindingFields}
            />
          </div>
        </div>

        {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          {lockBindingFields ? (
            <Button variant="outline" onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => void handleApply()} disabled={saving}>
                {saving ? "Saving..." : "Create snippet"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MwsAggregateSnippetChip(props: Record<string, unknown>) {
  const { inlineContent } = props as {
    inlineContent: {
      props: {
        dstId: string
        viewId: string
        column: string
        kind: WikiMwsAggregationKind
        filterByFormula: string
      }
    }
  }
  const [displayValue, setDisplayValue] = useState("…")
  const [error, setError] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const binding: WikiInlineMwsAggregateBinding = {
    dstId: inlineContent.props.dstId,
    viewId: inlineContent.props.viewId || undefined,
    kind: inlineContent.props.kind,
    column: inlineContent.props.column || undefined,
    filterByFormula: inlineContent.props.filterByFormula || undefined,
  }

  useEffect(() => {
    if (modalOpen) return
    if (!binding.dstId || !binding.kind) return
    let cancelled = false

    async function loadAggregate() {
      try {
        const result = await api.wiki.getMwsAggregateValue(binding.dstId, {
          kind: binding.kind,
          column: binding.column,
          viewId: binding.viewId,
          filterByFormula: binding.filterByFormula,
        })
        if (cancelled) return
        setDisplayValue(normalizeCellValue(result.value) || "—")
        setError(false)
      } catch {
        if (cancelled) return
        setError(true)
      }
    }

    void loadAggregate()
    const interval = window.setInterval(() => void loadAggregate(), 10_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [modalOpen, binding.dstId, binding.kind, binding.column, binding.viewId, binding.filterByFormula])

  const chipClass = error
    ? "bg-rose-100/90 text-rose-900 ring-rose-200"
    : "bg-violet-100/90 text-violet-900 ring-violet-200"

  return (
    <>
      <button
        type="button"
        className={`mx-0.5 inline-flex max-w-[280px] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 transition-colors hover:brightness-95 ${chipClass}`}
        onClick={() => setModalOpen(true)}
      >
        <SigmaIcon className="size-3" />
        <span className="truncate">{aggTitle(binding.kind)}: {displayValue}</span>
      </button>

      <WikiMwsAggregateSnippetConfigModal
        open={modalOpen}
        initial={binding}
        lockBindingFields
        onClose={() => setModalOpen(false)}
        onApply={async () => {}}
      />
    </>
  )
}

export const MwsAggregateInlineSnippetSpec = createReactInlineContentSpec(
  {
    type: "mwsAggregateSnippet",
    propSchema: {
      dstId: { default: "" as string },
      viewId: { default: "" as string },
      column: { default: "" as string },
      kind: { default: "count" as WikiMwsAggregationKind },
      filterByFormula: { default: "" as string },
    },
    content: "none",
  },
  {
    render: (props) => <MwsAggregateSnippetChip {...props} />,
  },
)
