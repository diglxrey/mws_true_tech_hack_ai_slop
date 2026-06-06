"use client"

import { useCallback, useEffect, useRef, useState, Component, ErrorInfo, ReactNode } from "react"
import { createReactBlockSpec } from "@blocknote/react"
import { ChevronLeftIcon, ChevronRightIcon, RefreshCwIcon, SettingsIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { api } from "@/lib/api"
import type { FusionField, FusionRecordsPage, FusionSelectOption } from "@/lib/wiki-types"
import { WikiMwsBlockConfigDialog } from "@/components/wiki/wiki-mws-block-config-dialog"
import { normalizeWikiMwsPageSize } from "@/lib/wiki-mws-pagination"

export interface MwsTableBlockAttrs {
  pageId: string
  blockId: string
  dstId: string
  viewId: string
  filterByFormula: string
  pageSize: number
  refreshIntervalSeconds: number
  allowEditBack: boolean
}

type IdentityValue = {
  name?: string
  title?: string
  nickname?: string
  displayName?: string
  userName?: string
  id?: string | number
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

function toDisplayText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map((v) => toDisplayText(v)).filter(Boolean).join(", ")
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return ""
    }
  }
  return String(value)
}

function toEditableString(value: unknown): string {
  if (value === null || value === undefined) return ""
  return typeof value === "string" ? value : toDisplayText(value)
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

function formatDateValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return ""
  if (typeof value === "number") {
    const dateFromMs = new Date(value)
    if (!Number.isNaN(dateFromMs.getTime())) return dateFromMs.toLocaleString()
    const dateFromSec = new Date(value * 1000)
    if (!Number.isNaN(dateFromSec.getTime())) return dateFromSec.toLocaleString()
  }
  if (typeof value === "string") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString()
    return value
  }
  return toDisplayText(value)
}

function formatNumberValue(field: FusionField, value: unknown): string {
  const parsed = parseNumberValue(value)
  if (parsed === null) return toDisplayText(value)
  const precision = typeof field.property?.precision === "number" ? field.property.precision : undefined
  const fixed = typeof precision === "number" ? parsed.toFixed(precision) : String(parsed)
  if (field.type === "Currency") {
    const symbol = typeof field.property?.symbol === "string" ? field.property.symbol : ""
    const align = field.property?.symbolAlign
    if (!symbol) return fixed
    return align === "right" ? `${fixed}${symbol}` : `${symbol}${fixed}`
  }
  if (field.type === "Percent") return `${fixed}%`
  return fixed
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

function normalizeIdentityList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") return String(item)
        if (item && typeof item === "object") {
          const person = item as IdentityValue
          return (
            person.name ??
            person.title ??
            person.displayName ??
            person.nickname ??
            person.userName ??
            (person.id !== undefined ? String(person.id) : "")
          )
        }
        return ""
      })
      .filter(Boolean)
  }
  if (typeof value === "string" || typeof value === "number") return [String(value)]
  if (value && typeof value === "object") {
    const person = value as IdentityValue
    const label =
      person.name ??
      person.title ??
      person.displayName ??
      person.nickname ??
      person.userName ??
      (person.id !== undefined ? String(person.id) : "")
    return label ? [label] : []
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

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

function isEditableFieldType(fieldType: FusionField["type"]): boolean {
  return [
    "SingleText",
    "Text",
    "SingleSelect",
    "MultiSelect",
    "Number",
    "Currency",
    "Percent",
    "DateTime",
    "Checkbox",
    "Rating",
    "URL",
    "Phone",
    "Email",
  ].includes(fieldType)
}

function renderCellDisplay(field: FusionField, rawValue: unknown, linkify = true): ReactNode {
  if (field.type === "SingleSelect") {
    const value = normalizeSingleSelectValue(rawValue)
    if (!value) return <span className="text-muted-foreground">—</span>
    const option = optionByName(field, value)
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getOptionColorClass(option?.color)}`}>
        {value}
      </span>
    )
  }

  if (field.type === "MultiSelect") {
    const values = normalizeMultiSelectValue(rawValue)
    if (values.length === 0) return <span className="text-muted-foreground">—</span>
    return (
      <div className="flex flex-wrap gap-1">
        {values.map((value) => {
          const option = optionByName(field, value)
          return (
            <span
              key={`${field.id}-${value}`}
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getOptionColorClass(option?.color)}`}
            >
              {value}
            </span>
          )
        })}
      </div>
    )
  }

  if (field.type === "Rating") {
    const max = typeof field.property?.max === "number" ? field.property.max : 5
    const value = Math.max(0, Math.min(max, parseNumberValue(rawValue) ?? 0))
    return (
      <span className="inline-flex text-base leading-none tracking-[1px] text-amber-500">
        {"★".repeat(value)}
        <span className="text-amber-200">{"★".repeat(Math.max(0, max - value))}</span>
      </span>
    )
  }

  if (field.type === "Checkbox") {
    const checked = parseBooleanValue(rawValue)
    return checked ? (
      <span className="inline-flex rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
        Yes
      </span>
    ) : (
      <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        No
      </span>
    )
  }

  if (field.type === "Member" || field.type === "CreatedBy" || field.type === "LastModifiedBy") {
    const identities = normalizeIdentityList(rawValue)
    if (identities.length === 0) return <span className="text-muted-foreground">—</span>
    return (
      <div className="flex flex-wrap gap-1">
        {identities.map((identity) => (
          <span key={`${field.id}-${identity}`} className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-300">
            {identity}
          </span>
        ))}
      </div>
    )
  }

  if (field.type === "URL") {
    const href = toEditableString(rawValue).trim()
    if (!href) return <span className="text-muted-foreground">—</span>
    if (!linkify) return <span className="block truncate" title={href}>{href}</span>
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline decoration-primary/40 underline-offset-2"
      >
        {href}
      </a>
    )
  }

  if (field.type === "Email") {
    const email = toEditableString(rawValue).trim()
    if (!email) return <span className="text-muted-foreground">—</span>
    if (!linkify) return <span className="block truncate" title={email}>{email}</span>
    return (
      <a href={`mailto:${email}`} className="text-primary underline decoration-primary/40 underline-offset-2">
        {email}
      </a>
    )
  }

  if (field.type === "Phone") {
    const phone = toEditableString(rawValue).trim()
    if (!phone) return <span className="text-muted-foreground">—</span>
    if (!linkify) return <span className="block truncate" title={phone}>{phone}</span>
    return (
      <a href={`tel:${phone}`} className="text-primary underline decoration-primary/40 underline-offset-2">
        {phone}
      </a>
    )
  }

  if (field.type === "DateTime" || field.type === "CreatedTime" || field.type === "LastModifiedTime") {
    const formatted = formatDateValue(rawValue)
    return <span className="block truncate" title={formatted}>{formatted || "—"}</span>
  }

  if (field.type === "Number" || field.type === "Currency" || field.type === "Percent" || field.type === "AutoNumber") {
    const formatted = formatNumberValue(field, rawValue)
    return <span className="block truncate tabular-nums" title={formatted}>{formatted || "—"}</span>
  }

  const value = toDisplayText(rawValue)
  return <span className="block truncate" title={value}>{value || "—"}</span>
}

function renderTextLikeEditor(
  field: FusionField,
  rawValue: unknown,
  onCommit: (value: unknown) => void,
  cancellingRef: React.MutableRefObject<boolean>,
  onDone: () => void,
): ReactNode {
  return (
    <TextLikeEditor
      field={field}
      rawValue={rawValue}
      onCommit={onCommit}
      cancellingRef={cancellingRef}
      onDone={onDone}
    />
  )
}

function TextLikeEditor({
  field,
  rawValue,
  onCommit,
  cancellingRef,
  onDone,
}: {
  field: FusionField
  rawValue: unknown
  onCommit: (value: unknown) => void
  cancellingRef: React.MutableRefObject<boolean>
  onDone: () => void
}) {
  const value = toEditableString(rawValue)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const inputType =
    field.type === "Email" ? "email" : field.type === "Phone" ? "tel" : field.type === "URL" ? "url" : "text"

  useEffect(() => {
    setDraft(value)
    setError(null)
  }, [field.id, value])

  return (
    <div className="w-full">
      <input
        key={`${field.id}-${value}`}
        type={inputType}
        value={draft}
        autoFocus
        aria-invalid={error ? "true" : "false"}
        className={`w-full rounded-sm px-1 -mx-1 text-sm outline-none ${
          error
            ? "border border-red-300 bg-red-50 text-red-700 focus:outline focus:outline-1 focus:outline-red-300 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300"
            : "bg-transparent focus:bg-background focus:outline focus:outline-1 focus:outline-border"
        }`}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const nextValue = e.currentTarget.value
          setDraft(nextValue)
          if (error && field.type === "Phone") {
            setError(getPhoneValidationError(nextValue))
          } else if (error && field.type === "Email") {
            setError(getEmailValidationError(nextValue))
          } else if (error) {
            setError(null)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cancellingRef.current = true
            e.currentTarget.blur()
          }
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        onBlur={(e) => {
          if (cancellingRef.current) {
            cancellingRef.current = false
            setDraft(value)
            setError(null)
            onDone()
            return
          }

          if (field.type === "Phone") {
            const validationError = getPhoneValidationError(e.currentTarget.value)
            if (validationError) {
              setError(validationError)
              return
            }
          }

          if (field.type === "Email") {
            const validationError = getEmailValidationError(e.currentTarget.value)
            if (validationError) {
              setError(validationError)
              return
            }
          }

          setError(null)
          onCommit(e.currentTarget.value)
          onDone()
        }}
      />
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MultiSelect styled dropdown editor
// ---------------------------------------------------------------------------

function MultiSelectEditor({
  field,
  selected: initialSelected,
  options,
  onCommit,
  onCancel,
  onDone,
}: {
  field: FusionField
  selected: string[]
  options: FusionSelectOption[]
  onCommit: (value: unknown) => void
  onCancel: () => void
  onDone: () => void
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCommit(selected)
        onDone()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [selected, onCommit, onDone])

  const toggle = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onCancel()
        }
      }}
    >
      {/* Selected pills */}
      <div className="flex flex-wrap gap-1 min-h-[24px] mb-1">
        {selected.length === 0 && (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {selected.map((value) => {
          const option = optionByName(field, value)
          return (
            <span
              key={value}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${getOptionColorClass(option?.color)}`}
            >
              {value}
              <button
                type="button"
                className="ml-0.5 text-current opacity-60 hover:opacity-100"
                onClick={() => toggle(value)}
              >
                ×
              </button>
            </span>
          )
        })}
      </div>

      {/* Dropdown */}
      <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-max min-w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
        {options.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Нет вариантов</p>
        )}
        {options.map((option) => {
          const name = option.name ?? ""
          const isSelected = selected.includes(name)
          return (
            <button
              key={`${field.id}-${name}`}
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
              onClick={() => toggle(name)}
            >
              <span
                className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                }`}
              >
                {isSelected && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${getOptionColorClass(option.color)}`}>
                {name || "Unnamed"}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function renderCellEditor(
  field: FusionField,
  rawValue: unknown,
  onCommit: (value: unknown) => void,
  cancellingRef: React.MutableRefObject<boolean>,
  onDone: () => void,
): ReactNode {
  if (field.type === "SingleSelect") {
    const selected = normalizeSingleSelectValue(rawValue)
    const options = field.property?.options ?? []
    return (
      <select
        key={`${field.id}-${selected}`}
        autoFocus
        defaultValue={selected}
        className="w-full rounded-sm border border-transparent bg-transparent px-1 text-sm outline-none focus:border-border focus:bg-background"
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          onCommit(e.target.value)
          onDone()
        }}
        onBlur={onDone}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={`${field.id}-${option.name ?? "option"}`} value={option.name ?? ""}>
            {option.name ?? "Unnamed"}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === "MultiSelect") {
    const selected = normalizeMultiSelectValue(rawValue)
    const options = field.property?.options ?? []
    return (
      <MultiSelectEditor
        key={`${field.id}-${selected.join("|")}`}
        field={field}
        selected={selected}
        options={options}
        onCommit={onCommit}
        onCancel={() => { cancellingRef.current = true; onDone() }}
        onDone={onDone}
      />
    )
  }

  if (field.type === "Checkbox") {
    const checked = parseBooleanValue(rawValue)
    return (
      <button
        type="button"
        autoFocus
        className={`rounded px-2 py-0.5 text-xs ${
          checked ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        }`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => {
          onCommit(!checked)
          onDone()
        }}
      >
        {checked ? "Yes" : "No"}
      </button>
    )
  }

  if (field.type === "Rating") {
    const max = typeof field.property?.max === "number" ? field.property.max : 5
    const value = Math.max(0, Math.min(max, parseNumberValue(rawValue) ?? 0))
    return (
      <div className="inline-flex text-base leading-none tracking-[1px]">
        {Array.from({ length: max }).map((_, index) => {
          const active = index < value
          return (
            <button
              key={`${field.id}-rating-${index}`}
              type="button"
              className={active ? "text-amber-500" : "text-amber-200"}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                onCommit(index + 1)
                onDone()
              }}
            >
              ★
            </button>
          )
        })}
      </div>
    )
  }

  if (field.type === "Number" || field.type === "Currency" || field.type === "Percent" || field.type === "AutoNumber") {
    const value = parseNumberValue(rawValue)
    return (
      <input
        key={`${field.id}-${value ?? ""}`}
        type="number"
        autoFocus
        defaultValue={value ?? ""}
        className="w-full bg-transparent text-sm outline-none focus:bg-background focus:outline focus:outline-1 focus:outline-border rounded-sm px-1 -mx-1"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cancellingRef.current = true
            e.currentTarget.blur()
          }
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        onBlur={(e) => {
          if (cancellingRef.current) {
            cancellingRef.current = false
            e.currentTarget.value = value === null ? "" : String(value)
            onDone()
            return
          }
          onCommit(e.currentTarget.value)
          onDone()
        }}
      />
    )
  }

  if (field.type === "DateTime") {
    const formatted = toEditableString(rawValue)
    return (
      <input
        key={`${field.id}-${formatted}`}
        type="datetime-local"
        autoFocus
        defaultValue={formatted}
        className="w-full bg-transparent text-sm outline-none focus:bg-background focus:outline focus:outline-1 focus:outline-border rounded-sm px-1 -mx-1"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cancellingRef.current = true
            e.currentTarget.blur()
          }
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        onBlur={(e) => {
          if (cancellingRef.current) {
            cancellingRef.current = false
            e.currentTarget.value = formatted
            onDone()
            return
          }
          onCommit(e.currentTarget.value)
          onDone()
        }}
      />
    )
  }

  return renderTextLikeEditor(field, rawValue, onCommit, cancellingRef, onDone)
}

function EditableCell({
  field,
  rawValue,
  onCommit,
  cancellingRef,
}: {
  field: FusionField
  rawValue: unknown
  onCommit: (value: unknown) => void
  cancellingRef: React.MutableRefObject<boolean>
}) {
  const [isEditing, setIsEditing] = useState(false)

  if (isEditing) {
    return renderCellEditor(field, rawValue, onCommit, cancellingRef, () => setIsEditing(false))
  }

  return (
    <button
      type="button"
      className="w-full rounded-sm px-1 -mx-1 text-left focus:outline focus:outline-1 focus:outline-border"
      onClick={() => setIsEditing(true)}
    >
      {renderCellDisplay(field, rawValue, false)}
    </button>
  )
}

function MwsTableRenderer({
  block,
  editor,
}: {
  block: { id: string; props: MwsTableBlockAttrs }
  editor: unknown
}) {
  const { dstId, pageId, filterByFormula, pageSize, refreshIntervalSeconds, viewId } = block.props
  const stableBlockId = block.props.blockId || block.id

  const [data, setData] = useState<FusionRecordsPage | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [fields, setFields] = useState<FusionField[]>([])
  const [loading, setLoading] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [blockConfig, setBlockConfig] = useState<{ allow_edit_back: boolean } | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [tableExpanded, setTableExpanded] = useState(false)

  // Track whether the current edit was cancelled (Escape) to suppress onBlur save
  const cancellingRef = useRef(false)

  // Use server config if loaded, otherwise fall back to block props
  const allowEditBack = blockConfig
    ? blockConfig.allow_edit_back
    : block.props.allowEditBack === true || (block.props.allowEditBack as unknown) === "true"

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  // Use a ref to read the latest fields inside fetchData without adding it to deps
  const fieldsRef = useRef<FusionField[]>(fields)
  fieldsRef.current = fields

  const effectivePageSize = normalizeWikiMwsPageSize(Number(pageSize) || 50)

  // Reset fields when the datasheet or view changes so stale column headers don't persist
  useEffect(() => {
    setFields([])
  }, [dstId, viewId])

  useEffect(() => {
    setPageNum(1)
  }, [dstId, viewId, filterByFormula, pageSize])

  // Load block config from server on mount
  useEffect(() => {
    if (!pageId || !stableBlockId) return
    api.wiki
      .getMwsBlockConfig(pageId, stableBlockId)
      .then((cfg) => {
        if (cfg) {
          setBlockConfig({ allow_edit_back: cfg.allow_edit_back })
        }
      })
      .catch((err) => {
        // Config may not exist yet, silently fail
        console.debug("MWS config not loaded:", err instanceof Error ? err.message : err)
      })
  }, [pageId, stableBlockId])

  // Backfill legacy blocks where `blockId` was missing in props.
  useEffect(() => {
    if (block.props.blockId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(editor as any).updateBlock(block, {
      props: {
        ...block.props,
        blockId: block.id,
      },
    })
  }, [block, editor])

  const fetchData = useCallback(async () => {
    if (!dstId) return
    setLoading(true)
    try {
      const currentFields = fieldsRef.current
      const [records, fieldList] = await Promise.all([
        api.wiki.getMwsRecords(dstId, {
          filterByFormula: filterByFormula || undefined,
          pageSize: effectivePageSize,
          pageNum,
          viewId: viewId || undefined,
          refreshIntervalSecs: refreshIntervalSeconds || 30,
        }),
        currentFields.length === 0 ? api.wiki.getMwsFields(dstId, viewId || undefined) : Promise.resolve(currentFields),
      ])
      setData(records)
      setPageNum(records.pageNum)
      if (currentFields.length === 0) setFields(fieldList)
    } catch {
      // silently fail — MWS may not be configured
    } finally {
      setLoading(false)
    }
  }, [dstId, filterByFormula, effectivePageSize, pageNum, viewId, refreshIntervalSeconds])

  useEffect(() => {
    void fetchData()
    const interval = (refreshIntervalSeconds || 30) * 1000
    intervalRef.current = setInterval(() => void fetchData(), interval)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchData, refreshIntervalSeconds])

  async function handleCellCommit(recordId: string, field: FusionField, value: unknown) {
    if (!allowEditBack) return

    const normalized = normalizeValueForPatch(field, value)
    const original = data?.records.find((r) => r.recordId === recordId)?.fields[field.name]
    if (valuesEqual(normalized, original)) return

    // Optimistic update for immediate feedback
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        records: prev.records.map((r) =>
          r.recordId === recordId ? { ...r, fields: { ...r.fields, [field.name]: normalized } } : r,
        ),
      }
    })
    setEditError(null)
    try {
      await api.wiki.patchMwsRecord(dstId, recordId, { [field.name]: normalized })
      // Refresh to confirm server state (cache is invalidated on the backend after patch)
      void fetchData()
    } catch {
      // Revert on error by re-fetching and inform the user
      setEditError("Failed to save. Changes reverted.")
      setTimeout(() => setEditError(null), 3000)
      void fetchData()
    }
  }

  function applyConfigToBlock(cfg: { dst_id: string; view_id?: string | null; filter_by_formula?: string | null; page_size: number; refresh_interval_secs: number; allow_edit_back: boolean }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(editor as any).updateBlock(block, {
      props: {
        ...block.props,
        pageId,
        blockId: stableBlockId,
        dstId: cfg.dst_id,
        viewId: cfg.view_id ?? "",
        filterByFormula: cfg.filter_by_formula ?? "",
        pageSize: cfg.page_size,
        refreshIntervalSeconds: cfg.refresh_interval_secs,
        allowEditBack: cfg.allow_edit_back,
      },
    })
    // Also update local state so editing works immediately
    setBlockConfig({ allow_edit_back: cfg.allow_edit_back })
  }

  if (!dstId) {
    return (
      <div
        className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground"
        contentEditable={false}
      >
        <p>MWS Table — click Configure to select a datasheet</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => setConfigOpen(true)}
        >
          <SettingsIcon className="mr-1 size-3" /> Configure
        </Button>
        {configOpen && (
          <WikiMwsBlockConfigDialog
            pageId={pageId}
            blockId={stableBlockId}
            open={configOpen}
            onClose={() => setConfigOpen(false)}
            onSave={applyConfigToBlock}
          />
        )}
      </div>
    )
  }

  const visibleFields = fields.length > 0 ? fields : (
    data?.records[0] ? Object.keys(data.records[0].fields).map((name) => ({ id: name, name, type: "Text" })) : []
  )

  const totalPages =
    data && data.total > 0 ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="flex max-w-full" contentEditable={false}>
      <div
        className={`rounded-l border text-sm ${
          tableExpanded
            ? "fixed inset-0 z-50 overflow-auto bg-background p-4"
            : "min-w-0 flex-1 overflow-x-auto"
        }`}
      >
        <div className="min-w-full w-max">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b">
        <span className="text-xs font-medium text-muted-foreground">
          MWS Table{data ? ` · ${data.total} records` : ""}
          {loading && " · refreshing…"}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {data && data.total > 0 ? (
            <>
              <span className="text-xs text-muted-foreground tabular-nums pr-1">
                Page {pageNum} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={pageNum <= 1 || loading}
                onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                title="Previous page"
              >
                <ChevronLeftIcon className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={pageNum >= totalPages || loading}
                onClick={() => setPageNum((p) => Math.min(totalPages, p + 1))}
                title="Next page"
              >
                <ChevronRightIcon className="size-3" />
              </Button>
            </>
          ) : null}
          <Button variant="ghost" size="icon-xs" onClick={() => void fetchData()} title="Refresh">
            <RefreshCwIcon className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => setConfigOpen(true)} title="Configure">
            <SettingsIcon className="size-3" />
          </Button>
        </div>
      </div>

      {editError && (
        <div className="px-3 py-1.5 text-xs text-destructive bg-destructive/10 border-b">
          {editError}
        </div>
      )}

      {data && data.records.length > 0 ? (
        <div className="flex flex-col">
          {/* Sticky header */}
          <div className="w-full shrink-0" style={{ display: "grid", gridTemplateColumns: `repeat(${visibleFields.length}, 1fr)` }}>
            {visibleFields.map((f, fieldIndex) => (
              <div
                key={`header-${f.id}`}
                className={`px-3 py-1.5 text-left text-xs font-medium text-muted-foreground border-b bg-muted/30 ${
                  fieldIndex < visibleFields.length - 1 ? "border-r border-border" : ""
                }`}
              >
                {f.name}
              </div>
            ))}
          </div>
          {/* Scrollable data rows — max 10 rows visible (~28px per row) */}
          <div
            className="w-full scrollbar-hide"
            style={
              !tableExpanded && data.records.length > 10
                ? { maxHeight: "280px", overflowY: "auto" }
                : undefined
            }
          >
            <div className="w-full" style={{ display: "grid", gridTemplateColumns: `repeat(${visibleFields.length}, 1fr)` }}>
              {data.records.map((record) =>
                visibleFields.map((f, fieldIndex) => {
                  const cellValue = record.fields[f.name]
                  const editable = allowEditBack && isEditableFieldType(f.type)
                  return (
                    <div
                      key={`${record.recordId}-${f.id}`}
                      className={`px-3 py-1 border-b hover:bg-muted/20 ${
                        fieldIndex < visibleFields.length - 1 ? "border-r border-border" : ""
                      }`}
                    >
                      {editable
                        ? (
                          <EditableCell
                            field={f}
                            rawValue={cellValue}
                            onCommit={(nextValue) => {
                              void handleCellCommit(record.recordId, f, nextValue)
                            }}
                            cancellingRef={cancellingRef}
                          />
                        )
                        : renderCellDisplay(f, cellValue)}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          {loading ? "Loading…" : "No records"}
        </p>
      )}

      {configOpen && (
        <WikiMwsBlockConfigDialog
          pageId={pageId}
          blockId={stableBlockId}
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          onSave={applyConfigToBlock}
        />
      )}
      </div>
      </div>
      {/* Expand/Collapse toggle at top-right when expanded */}
      {tableExpanded && (
        <button
          type="button"
          onClick={() => setTableExpanded(false)}
          className="fixed top-4 right-4 z-[51] rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md transition-colors hover:bg-muted hover:text-foreground"
          title="Свернуть таблицу"
        >
          ✕ Свернуть
        </button>
      )}
      {/* Right-side expand strip */}
      {!tableExpanded && (
        <button
          type="button"
          onClick={() => setTableExpanded(true)}
          className="flex w-6 shrink-0 items-center justify-center rounded-r border border-l-0 border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          title="Развернуть таблицу на всю ширину"
          contentEditable={false}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="13 7 18 12 13 17" />
            <polyline points="6 7 11 12 6 17" />
          </svg>
        </button>
      )}
    </div>
  )
}

// Error boundary for MWS table block
class MwsTableErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo): void {
    console.error("MWS Table error:", error)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Error loading MWS table. Please try again.
        </div>
      )
    }
    return this.props.children
  }
}

export const MwsTableBlockSpec = createReactBlockSpec(
  {
    type: "mwsTable" as const,
    propSchema: {
      pageId: { default: "" as string },
      blockId: { default: "" as string },
      dstId: { default: "" as string },
      viewId: { default: "" as string },
      filterByFormula: { default: "" as string },
      pageSize: { default: 50 as number },
      refreshIntervalSeconds: { default: 30 as number },
      allowEditBack: { default: false as boolean },
    },
    content: "none",
  },
  {
    render: (props) => (
      <MwsTableErrorBoundary>
        <MwsTableRenderer block={props.block as { id: string; props: MwsTableBlockAttrs }} editor={props.editor} />
      </MwsTableErrorBoundary>
    ),
  },
)
