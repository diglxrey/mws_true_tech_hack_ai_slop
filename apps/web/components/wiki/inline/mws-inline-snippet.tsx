"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createReactInlineContentSpec } from "@blocknote/react"
import { ChevronDown, PencilIcon, SparklesIcon, X } from "lucide-react"
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
import { cn } from "@workspace/ui/lib/utils"
import { api } from "@/lib/api"
import type { FusionField, FusionNode, FusionRecordsPage, FusionSelectOption, WikiInlineMwsSnippetBinding } from "@/lib/wiki-types"

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

function getPhoneValidationError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\+?[\d()\s-]+$/.test(trimmed)) return "Enter a valid phone number"

  const openingParens = (trimmed.match(/\(/g) ?? []).length
  const closingParens = (trimmed.match(/\)/g) ?? []).length
  if (openingParens !== closingParens) return "Enter a valid phone number"

  const digits = trimmed.replace(/\D/g, "")
  if (digits.length < 7 || digits.length > 15) return "Enter a valid phone number"

  return null
}

function getEmailValidationError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email address"
  return null
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

function parseBooleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on"
  }
  return false
}

function parseNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim()
    if (!normalized) return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function getOptionColorClass(color?: unknown): string {
  const key = String(color ?? "").toLowerCase()
  if (["red", "orange", "sunrise"].includes(key)) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
  if (["gold", "yellow", "amber"].includes(key)) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
  if (["green", "lime"].includes(key)) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
  if (["cyan", "blue", "indigo", "purple", "violet"].includes(key)) return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
  if (["pink", "magenta"].includes(key)) return "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"
  if (["gray", "grey", "stone"].includes(key)) return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
  return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
}

function optionByName(field: FusionField, name: string): FusionSelectOption | undefined {
  return field.property?.options?.find((option) => option.name === name)
}

// ---------------------------------------------------------------------------
// Styled MultiSelect for inline snippet value editing
// ---------------------------------------------------------------------------

function InlineMultiSelectEditor({
  field,
  selected,
  disabled,
  onToggle,
  onSave,
}: {
  field: FusionField
  selected: string[]
  disabled?: boolean
  onToggle: (name: string) => void
  onSave: () => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const options = field.property?.options ?? []

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        onSave()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onSave])

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "flex w-full min-h-[38px] items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors",
          "hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-ring ring-3 ring-ring/50",
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex flex-1 flex-wrap gap-1">
          {selected.length === 0 ? (
            <span className="text-muted-foreground text-sm">Select options…</span>
          ) : (
            selected.map((value) => {
              const opt = optionByName(field, value)
              return (
                <span
                  key={value}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${getOptionColorClass(opt?.color)}`}
                >
                  {value}
                  <span
                    role="button"
                    tabIndex={0}
                    className="ml-0.5 cursor-pointer text-current opacity-60 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggle(value)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        e.stopPropagation()
                        onToggle(value)
                      }
                    }}
                  >
                    <X className="size-3" />
                  </span>
                </span>
              )
            })
          )}
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && !disabled ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No options available</p>
          ) : (
            options.map((option) => {
              const name = option.name ?? ""
              const isSelected = selected.includes(name)
              return (
                <button
                  key={name}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                  onClick={() => onToggle(name)}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {isSelected ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getOptionColorClass(option.color)}`}>
                    {name || "Unnamed"}
                  </span>
                </button>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

function normalizeSingleSelectValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name
    if (typeof name === "string") return name
  }
  return ""
}

function normalizeMultiSelectValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item
        if (item && typeof item === "object" && "name" in item) {
          const name = (item as { name?: unknown }).name
          return typeof name === "string" ? name : ""
        }
        return ""
      })
      .filter(Boolean)
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeValueForPatch(field: FusionField, value: unknown): unknown {
  switch (field.type) {
    case "SingleSelect":
      return normalizeSingleSelectValue(value)
    case "MultiSelect":
      return normalizeMultiSelectValue(value)
    case "Checkbox":
      return parseBooleanValue(value)
    case "Number":
    case "Currency":
    case "Percent":
    case "AutoNumber": {
      const parsed = parseNumberValue(value)
      return parsed ?? null
    }
    case "Rating": {
      const parsed = parseNumberValue(value)
      if (parsed === null) return 0
      const max = typeof field.property?.max === "number" ? field.property.max : 5
      const rounded = Math.round(parsed)
      return Math.max(0, Math.min(max, rounded))
    }
    case "DateTime":
    case "CreatedTime":
    case "LastModifiedTime":
      return typeof value === "string" ? value.trim() : value
    default:
      return value
  }
}

function SmartInput({ label, value, onChange, options, placeholder, disabled }: SmartInputProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputValue = value
  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase()
    if (!query) return options.slice(0, 30)
    return options
      .filter((option) => option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query))
      .slice(0, 30)
  }, [inputValue, options])

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

interface SnippetConfigModalProps {
  open: boolean
  initial: WikiInlineMwsSnippetBinding
  onClose: () => void
  lockBindingFields?: boolean
  onApply: (binding: WikiInlineMwsSnippetBinding, displayValue: string) => Promise<void> | void
}

export function WikiMwsSnippetConfigModal({
  open,
  initial,
  onClose,
  lockBindingFields = false,
  onApply,
}: SnippetConfigModalProps) {
  const [datasheets, setDatasheets] = useState<FusionNode[]>([])
  const [fields, setFields] = useState<FusionField[]>([])
  const [records, setRecords] = useState<FusionRecordsPage | null>(null)
  const [dstId, setDstId] = useState(initial.dstId)
  const [viewId, setViewId] = useState(initial.viewId ?? "")
  const [pkColumn, setPkColumn] = useState(initial.pkColumn)
  const [pkValue, setPkValue] = useState(initial.pkValue)
  const [valueColumn, setValueColumn] = useState(initial.valueColumn)
  const [recordId, setRecordId] = useState(initial.recordId ?? "")
  const [resolvedValue, setResolvedValue] = useState("")
  const [resolvedRawValue, setResolvedRawValue] = useState<unknown>("")
  const [valueDirty, setValueDirty] = useState(false)
  const [valueError, setValueError] = useState<string | null>(null)
  const [valueFocused, setValueFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedValueField = useMemo(
    () => fields.find((field) => field.name === valueColumn || field.id === valueColumn),
    [fields, valueColumn],
  )

  useEffect(() => {
    if (!open) return
    setDstId(initial.dstId)
    setViewId(initial.viewId ?? "")
    setPkColumn(initial.pkColumn)
    setPkValue(initial.pkValue)
    setValueColumn(initial.valueColumn)
    setRecordId(initial.recordId ?? "")
    setResolvedValue("")
    setResolvedRawValue("")
    setValueDirty(false)
    setValueError(null)
    setValueFocused(false)
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

  useEffect(() => {
    if (!open || !dstId || !pkColumn) return
    void api.wiki.getMwsRecords(dstId, { pageSize: 200, pageNum: 1, viewId: viewId || undefined }).then(setRecords).catch(() => setRecords(null))
  }, [open, dstId, pkColumn, viewId])

  useEffect(() => {
    if (!open || !dstId || !pkColumn || !pkValue || !valueColumn) return
    if (lockBindingFields && (valueDirty || valueFocused)) return
    setError(null)
    void api.wiki.getMwsSnippetValue(dstId, {
      pkColumn,
      pkValue,
      valueColumn,
      viewId: viewId || undefined,
    }).then((result) => {
      setRecordId(result.record_id ?? "")
      setResolvedRawValue(result.value)
      setResolvedValue(normalizeCellValue(result.value))
      setValueDirty(false)
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load snippet value.")
      setResolvedRawValue("")
      setResolvedValue("")
    })
  }, [open, dstId, pkColumn, pkValue, valueColumn, viewId, lockBindingFields, valueDirty, valueFocused])

  const datasheetOptions = useMemo<SmartOption[]>(
    () => datasheets.map((sheet) => ({ value: sheet.id, label: sheet.name })),
    [datasheets],
  )
  const columnOptions = useMemo<SmartOption[]>(
    () => fields.map((field) => ({ value: field.name, label: `${field.name} (${field.type})` })),
    [fields],
  )
  const rowOptions = useMemo<SmartOption[]>(() => {
    if (!records || !pkColumn) return []
    return records.records
      .map((record) => normalizeCellValue(record.fields[pkColumn]))
      .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index)
      .map((value) => ({ value, label: value }))
  }, [records, pkColumn])

  async function handleApply() {
    if (!dstId || !pkColumn || !pkValue || !valueColumn) {
      setError("Please select datasheet, PK column, PK value, and value column.")
      return
    }

    setSaving(true)
    setError(null)
    try {
      if (recordId && valueColumn && valueDirty) {
        await api.wiki.patchMwsRecord(dstId, recordId, { [valueColumn]: resolvedValue })
      }

      const binding: WikiInlineMwsSnippetBinding = {
        dstId,
        viewId: viewId || undefined,
        pkColumn,
        pkValue,
        valueColumn,
        recordId: recordId || undefined,
      }
      await onApply(binding, resolvedValue)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply snippet settings.")
    } finally {
      setSaving(false)
    }
  }

  async function saveEditedValueIfNeeded(nextRawValue?: unknown, force = false) {
    if (!lockBindingFields || (!force && !valueDirty)) return
    if (!recordId || !valueColumn || !dstId) {
      setError("Cannot save value: missing snippet record mapping.")
      return
    }

    setSaving(true)
    setError(null)
    setValueError(null)
    try {
      if (selectedValueField?.type === "Phone") {
        const nextErr = getPhoneValidationError(resolvedValue)
        if (nextErr) {
          setValueError(nextErr)
          return
        }
      }
      if (selectedValueField?.type === "Email") {
        const nextErr = getEmailValidationError(resolvedValue)
        if (nextErr) {
          setValueError(nextErr)
          return
        }
      }

      const rawValue = nextRawValue ?? resolvedRawValue
      const payload = selectedValueField
        ? normalizeValueForPatch(selectedValueField, rawValue)
        : rawValue
      await api.wiki.patchMwsRecord(dstId, recordId, { [valueColumn]: payload })
      setValueDirty(false)
      const binding: WikiInlineMwsSnippetBinding = {
        dstId,
        viewId: viewId || undefined,
        pkColumn,
        pkValue,
        valueColumn,
        recordId: recordId || undefined,
      }
      await onApply(binding, normalizeCellValue(payload))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save snippet value.")
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
          <SparklesIcon className="size-4 text-primary" />
          <h3 className="text-base font-semibold">MWS Inline Snippet</h3>
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
          <SmartInput
            label="Primary key column"
            value={pkColumn}
            onChange={setPkColumn}
            options={columnOptions}
            placeholder="Select or type PK column"
            disabled={!dstId || lockBindingFields}
          />
          <SmartInput
            label="Primary key value (row)"
            value={pkValue}
            onChange={setPkValue}
            options={rowOptions}
            placeholder="Select or type PK value"
            disabled={!pkColumn || lockBindingFields}
          />
          <SmartInput
            label="Value column"
            value={valueColumn}
            onChange={setValueColumn}
            options={columnOptions}
            placeholder="Select or type value column"
            disabled={!dstId || lockBindingFields}
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
            <Label>Snippet value (editable in this window)</Label>
            <div className="relative">
              {selectedValueField?.type === "SingleSelect" ? (
                <Select
                  value={normalizeSingleSelectValue(resolvedRawValue)}
                  disabled={saving}
                  onValueChange={(next) => {
                    setResolvedRawValue(next)
                    setResolvedValue(next)
                    setValueDirty(true)
                    void saveEditedValueIfNeeded(next, true)
                  }}
                >
                  <SelectTrigger className="w-full">
                    {normalizeSingleSelectValue(resolvedRawValue) ? (
                      (() => {
                        const val = normalizeSingleSelectValue(resolvedRawValue)
                        const opt = optionByName(selectedValueField, val)
                        return (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getOptionColorClass(opt?.color)}`}>
                            {val}
                          </span>
                        )
                      })()
                    ) : (
                      <SelectValue placeholder="—" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    {(selectedValueField.property?.options ?? []).map((option) => (
                      <SelectItem key={option.name ?? "option"} value={option.name ?? ""}>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getOptionColorClass(option.color)}`}>
                          {option.name ?? "Unnamed"}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : selectedValueField?.type === "MultiSelect" ? (
                <InlineMultiSelectEditor
                  field={selectedValueField}
                  selected={normalizeMultiSelectValue(resolvedRawValue)}
                  disabled={saving}
                  onToggle={(name) => {
                    const current = normalizeMultiSelectValue(resolvedRawValue)
                    const next = current.includes(name)
                      ? current.filter((v) => v !== name)
                      : [...current, name]
                    setResolvedRawValue(next)
                    setResolvedValue(next.join(", "))
                    setValueDirty(true)
                  }}
                  onSave={() => {
                    void saveEditedValueIfNeeded()
                  }}
                />
              ) : selectedValueField?.type === "Checkbox" ? (
                <button
                  type="button"
                  className={`w-full rounded-md px-3 py-2 text-sm ${parseBooleanValue(resolvedRawValue) ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}
                  disabled={saving}
                  onClick={() => {
                    const next = !parseBooleanValue(resolvedRawValue)
                    setResolvedRawValue(next)
                    setResolvedValue(next ? "Yes" : "No")
                    setValueDirty(true)
                    void saveEditedValueIfNeeded(next, true)
                  }}
                >
                  {parseBooleanValue(resolvedRawValue) ? "Yes" : "No"}
                </button>
              ) : selectedValueField?.type === "Rating" ? (
                <div className="inline-flex text-xl leading-none tracking-[1px]">
                  {Array.from({ length: typeof selectedValueField.property?.max === "number" ? selectedValueField.property.max : 5 }).map((_, index) => {
                    const active = index < (parseNumberValue(resolvedRawValue) ?? 0)
                    return (
                      <button
                        key={`rating-${index}`}
                        type="button"
                        className={active ? "text-amber-500" : "text-amber-200"}
                        disabled={saving}
                        onClick={() => {
                          const next = index + 1
                          setResolvedRawValue(next)
                          setResolvedValue(String(next))
                          setValueDirty(true)
                          void saveEditedValueIfNeeded(next, true)
                        }}
                      >
                        ★
                      </button>
                    )
                  })}
                </div>
              ) : (
                <Input
                  type={
                    selectedValueField?.type === "Email"
                      ? "email"
                      : selectedValueField?.type === "Phone"
                        ? "tel"
                        : selectedValueField?.type === "URL"
                          ? "url"
                          : selectedValueField?.type === "Number" || selectedValueField?.type === "Currency" || selectedValueField?.type === "Percent"
                            ? "number"
                            : selectedValueField?.type === "DateTime"
                              ? "datetime-local"
                              : "text"
                  }
                  value={resolvedValue}
                  onFocus={() => setValueFocused(true)}
                  onChange={(e) => {
                    const nextValue = e.currentTarget.value
                    setResolvedValue(nextValue)
                    setResolvedRawValue(nextValue)
                    setValueDirty(true)
                    if (valueError && selectedValueField?.type === "Phone") {
                      setValueError(getPhoneValidationError(nextValue))
                    } else if (valueError && selectedValueField?.type === "Email") {
                      setValueError(getEmailValidationError(nextValue))
                    } else if (valueError) {
                      setValueError(null)
                    }
                  }}
                  onBlur={() => {
                    setValueFocused(false)
                    void saveEditedValueIfNeeded()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLInputElement).blur()
                    }
                  }}
                  placeholder="Value"
                  disabled={!valueColumn || saving}
                />
              )}
            </div>
            {valueError ? <p className="text-xs text-destructive">{valueError}</p> : null}
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
                {saving ? "Saving..." : "Apply snippet"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MwsInlineSnippetChip(props: Record<string, unknown>) {
  const { inlineContent, updateInlineContent } = props as {
    inlineContent: {
      props: {
        dstId: string
        viewId: string
        pkColumn: string
        pkValue: string
        valueColumn: string
        recordId: string
      }
    }
    updateInlineContent: (update: { type: "mwsSnippet"; props: {
      dstId: string
      viewId: string
      pkColumn: string
      pkValue: string
      valueColumn: string
      recordId: string
    } }) => void
  }
  const [displayValue, setDisplayValue] = useState("…")
  const [error, setError] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const binding: WikiInlineMwsSnippetBinding = {
    dstId: inlineContent.props.dstId,
    viewId: inlineContent.props.viewId || undefined,
    pkColumn: inlineContent.props.pkColumn,
    pkValue: inlineContent.props.pkValue,
    valueColumn: inlineContent.props.valueColumn,
    recordId: inlineContent.props.recordId || undefined,
  }

  useEffect(() => {
    if (modalOpen) return
    if (!binding.dstId || !binding.pkColumn || !binding.pkValue || !binding.valueColumn) return
    let cancelled = false

    async function loadValue() {
      try {
        const result = await api.wiki.getMwsSnippetValue(binding.dstId, {
          pkColumn: binding.pkColumn,
          pkValue: binding.pkValue,
          valueColumn: binding.valueColumn,
          viewId: binding.viewId,
        })
        if (cancelled) return
        setDisplayValue(normalizeCellValue(result.value) || "—")
        setError(!result.found)
        if ((result.record_id ?? "") !== (binding.recordId ?? "")) {
          updateInlineContent({
            type: "mwsSnippet",
            props: {
              dstId: binding.dstId,
              viewId: binding.viewId ?? "",
              pkColumn: binding.pkColumn,
              pkValue: binding.pkValue,
              valueColumn: binding.valueColumn,
              recordId: result.record_id ?? "",
            },
          })
        }
      } catch {
        if (cancelled) return
        setError(true)
      }
    }

    void loadValue()
    const interval = window.setInterval(() => void loadValue(), 3500)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [modalOpen, binding.dstId, binding.pkColumn, binding.pkValue, binding.valueColumn, binding.viewId, binding.recordId, updateInlineContent])

  const chipClass = error
    ? "bg-amber-100/80 text-amber-900 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700"
    : "bg-primary/10 text-primary ring-primary/20"

  return (
    <>
      <button
        type="button"
        className={`mx-0.5 inline-flex max-w-[260px] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 transition-colors hover:brightness-95 ${chipClass}`}
        onClick={() => setModalOpen(true)}
      >
        <PencilIcon className="size-3" />
        <span className="truncate">{displayValue}</span>
      </button>

      <WikiMwsSnippetConfigModal
        open={modalOpen}
        initial={binding}
        lockBindingFields
        onClose={() => setModalOpen(false)}
        onApply={async (nextBinding, nextDisplayValue) => {
          updateInlineContent({
            type: "mwsSnippet",
            props: {
              dstId: nextBinding.dstId,
              viewId: nextBinding.viewId ?? "",
              pkColumn: nextBinding.pkColumn,
              pkValue: nextBinding.pkValue,
              valueColumn: nextBinding.valueColumn,
              recordId: nextBinding.recordId ?? "",
            },
          })
          setDisplayValue(nextDisplayValue || "—")
          setError(false)
        }}
      />
    </>
  )
}

export const MwsInlineSnippetSpec = createReactInlineContentSpec(
  {
    type: "mwsSnippet",
    propSchema: {
      dstId: { default: "" as string },
      viewId: { default: "" as string },
      pkColumn: { default: "" as string },
      pkValue: { default: "" as string },
      valueColumn: { default: "" as string },
      recordId: { default: "" as string },
    },
    content: "none",
  },
  {
    render: (props) => <MwsInlineSnippetChip {...props} />,
  },
)

export type MwsSnippetInlineProps = WikiInlineMwsSnippetBinding
