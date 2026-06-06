import { createElement } from "react"
import { defineSlashItem } from "@snipeter/editor-sdk"

function InfoIcon() {
  return createElement(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: 18,
      height: 18,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    createElement("circle", { cx: 12, cy: 12, r: 10 }),
    createElement("line", { x1: 12, y1: 8, x2: 12, y2: 12 }),
    createElement("line", { x1: 12, y1: 16, x2: "12.01", y2: 16 }),
  )
}

/**
 * Slash-menu item factory for the callout block.
 * Returns a fresh item each time it's called so the `onItemClick` closure
 * captures the current editor instance.
 */
export const calloutSlashItem = defineSlashItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (editor: any) => ({
    title: "Callout",
    badge: "⌘-⌥-C",
    aliases: ["callout", "note", "tip", "warning", "danger", "alert", "info"],
    group: "Basic",
    icon: createElement(InfoIcon),
    subtext: "A highlighted callout box (note, tip, warning, danger)",
    onItemClick: () => {
      const cursorBlock = editor.getTextCursorPosition().block
      editor.insertBlocks(
        [{ type: "callout", props: { variant: "note", icon: "", collapsed: false } }],
        cursorBlock,
        "after",
      )
    },
  }),
)
