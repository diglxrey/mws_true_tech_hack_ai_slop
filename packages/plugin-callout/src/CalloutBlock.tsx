"use client"

import { useState, useRef } from "react"
import { createReactBlockSpec } from "@blocknote/react"
import { BlockSettingsDialog } from "@snipeter/editor-sdk"

// ─── Variant metadata ───────────────────────────────────────────────────────

type CalloutVariant = "note" | "tip" | "warning" | "danger"

const VARIANTS: Record<
  CalloutVariant,
  { label: string; icon: string; borderColor: string; bgColor: string; labelColor: string }
> = {
  note: {
    label: "Note",
    icon: "ℹ️",
    borderColor: "#3b82f6",
    bgColor: "#eff6ff",
    labelColor: "#1d4ed8",
  },
  tip: {
    label: "Tip",
    icon: "💡",
    borderColor: "#22c55e",
    bgColor: "#f0fdf4",
    labelColor: "#15803d",
  },
  warning: {
    label: "Warning",
    icon: "⚠️",
    borderColor: "#f59e0b",
    bgColor: "#fffbeb",
    labelColor: "#b45309",
  },
  danger: {
    label: "Danger",
    icon: "🚨",
    borderColor: "#ef4444",
    bgColor: "#fef2f2",
    labelColor: "#b91c1c",
  },
}

const VARIANT_ORDER: CalloutVariant[] = ["note", "tip", "warning", "danger"]

// ─── Settings dialog ────────────────────────────────────────────────────────

function CalloutSettingsDialog({
  open,
  onClose,
  variant,
  icon,
  collapsed,
  onChange,
}: {
  open: boolean
  onClose: () => void
  variant: CalloutVariant
  icon: string
  collapsed: boolean
  onChange: (patch: { variant?: CalloutVariant; icon?: string; collapsed?: boolean }) => void
}) {
  const [localIcon, setLocalIcon] = useState(icon)

  return (
    <BlockSettingsDialog open={open} onClose={onClose} title="Callout settings">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Variant picker */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Variant
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {VARIANT_ORDER.map((v) => {
              const meta = VARIANTS[v]
              const isSelected = v === variant
              return (
                <button
                  key={v}
                  onClick={() => onChange({ variant: v })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: `2px solid ${isSelected ? meta.borderColor : "#e5e7eb"}`,
                    background: isSelected ? meta.bgColor : "#fff",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? meta.labelColor : "#374151",
                    transition: "all 0.15s",
                  }}
                >
                  <span>{meta.icon}</span>
                  <span>{meta.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Custom icon */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Custom icon <span style={{ fontWeight: 400, color: "#9ca3af" }}>(emoji or leave blank)</span>
          </label>
          <input
            type="text"
            value={localIcon}
            maxLength={4}
            placeholder={VARIANTS[variant].icon}
            onChange={(e) => setLocalIcon(e.target.value)}
            onBlur={() => onChange({ icon: localIcon })}
            style={{
              width: "100%",
              padding: "6px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Collapsed toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#374151" }}>Start collapsed</span>
          <button
            role="switch"
            aria-checked={collapsed}
            onClick={() => onChange({ collapsed: !collapsed })}
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              border: "none",
              background: collapsed ? "#3b82f6" : "#d1d5db",
              cursor: "pointer",
              position: "relative",
              transition: "background 0.2s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: collapsed ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 4,
            padding: "8px 14px",
            background: "#1d2023",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            alignSelf: "flex-end",
          }}
        >
          Done
        </button>
      </div>
    </BlockSettingsDialog>
  )
}

// ─── Block renderer ─────────────────────────────────────────────────────────

function CalloutRenderer({
  block,
  editor,
  contentRef,
}: {
  block: {
    id: string
    props: { variant: string; icon: string; collapsed: boolean }
  }
  editor: { updateBlock: (block: unknown, update: unknown) => void; isEditable: boolean }
  contentRef: React.Ref<HTMLDivElement>
}) {
  const { variant, icon, collapsed } = block.props
  const variantKey = (VARIANT_ORDER.includes(variant as CalloutVariant) ? variant : "note") as CalloutVariant
  const meta = VARIANTS[variantKey]
  const displayIcon = icon || meta.icon

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(collapsed)
  const headerRef = useRef<HTMLDivElement>(null)

  function applyPatch(patch: { variant?: CalloutVariant; icon?: string; collapsed?: boolean }) {
    editor.updateBlock(block, { props: { ...block.props, ...patch } })
    if (patch.collapsed !== undefined) setIsCollapsed(patch.collapsed)
  }

  return (
    <div
      style={{
        borderLeft: `4px solid ${meta.borderColor}`,
        background: meta.bgColor,
        borderRadius: "0 8px 8px 0",
        marginBottom: 4,
        overflow: "hidden",
      }}
      contentEditable={false}
    >
      {/* Header row */}
      <div
        ref={headerRef}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setIsCollapsed((v) => !v)}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{displayIcon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: meta.labelColor, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {meta.label}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: meta.labelColor, opacity: 0.7 }}>
          {isCollapsed ? "▸" : "▾"}
        </span>
        {editor.isEditable && (
          <button
            onClick={(e) => { e.stopPropagation(); setSettingsOpen(true) }}
            aria-label="Callout settings"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
              fontSize: 14,
              color: meta.labelColor,
              opacity: 0.6,
              lineHeight: 1,
            }}
          >
            ⚙
          </button>
        )}
      </div>

      {/* Inline content area */}
      {!isCollapsed && (
        <div
          style={{ padding: "4px 12px 10px 12px" }}
          contentEditable={editor.isEditable}
          suppressContentEditableWarning
        >
          <div ref={contentRef} />
        </div>
      )}

      <CalloutSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        variant={variantKey}
        icon={icon}
        collapsed={collapsed}
        onChange={(patch) => { applyPatch(patch); if (patch.collapsed !== undefined) setSettingsOpen(false) }}
      />
    </div>
  )
}

// ─── Block spec ─────────────────────────────────────────────────────────────

export const calloutBlockSpec = createReactBlockSpec(
  {
    type: "callout" as const,
    propSchema: {
      variant: { default: "note" },
      icon: { default: "" },
      collapsed: { default: false },
    },
    content: "inline",
  },
  {
    render: (props) =>
      CalloutRenderer({
        block: props.block as {
          id: string
          props: { variant: string; icon: string; collapsed: boolean }
        },
        editor: props.editor as { updateBlock: (block: unknown, update: unknown) => void; isEditable: boolean },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contentRef: (props as any).contentRef,
      }),
  },
)
