"use client"

import { useEffect, useRef } from "react"
import type { ReactNode } from "react"

interface BlockSettingsDialogProps {
  /** Controls visibility */
  open: boolean
  /** Called when the user dismisses the dialog (backdrop click or Escape) */
  onClose: () => void
  /** Dialog heading */
  title?: string
  children: ReactNode
}

/**
 * A minimal, dependency-free settings dialog for block plugins.
 *
 * Renders as a centred overlay with backdrop. Closes on Escape key or
 * backdrop click. Uses inline styles so it works without any specific CSS
 * framework configured in the consumer's app.
 *
 * Override appearance by wrapping in a container that sets CSS variables, or
 * replace entirely with your own dialog component.
 *
 * @example
 * function MyBlockRenderer({ block, editor }) {
 *   const [open, setOpen] = useState(false)
 *   return (
 *     <div>
 *       <button onClick={() => setOpen(true)}>Settings</button>
 *       <BlockSettingsDialog open={open} onClose={() => setOpen(false)} title="Block settings">
 *         <label>Variant</label>
 *         <select value={block.props.variant} onChange={...}>...</select>
 *       </BlockSettingsDialog>
 *     </div>
 *   )
 * }
 */
export function BlockSettingsDialog({ open, onClose, title, children }: BlockSettingsDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        style={{
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          padding: "24px 28px",
          minWidth: 300,
          maxWidth: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
          position: "relative",
        }}
        contentEditable={false}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          {title && (
            <span style={{ fontWeight: 600, fontSize: 15, color: "#1d2023" }}>{title}</span>
          )}
          <button
            onClick={onClose}
            aria-label="Close settings"
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "#969fa8",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
