import { definePlugin, defineBlockPlugin, defineSlashItem } from "@snipeter/editor-sdk"
import { createElement } from "react"
import { MwsTableBlockSpec } from "../blocks/mws-table-block"

function TableIcon() {
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
    createElement("rect", { width: 18, height: 18, x: 3, y: 3, rx: 2 }),
    createElement("path", { d: "M3 9h18" }),
    createElement("path", { d: "M3 15h18" }),
    createElement("path", { d: "M9 3v18" }),
  )
}

/**
 * Current pageId — updated via `setMwsPageId` from the host editor.
 * The slash-menu item's `onItemClick` reads this at invocation time.
 */
let _pageId = ""
export function setMwsPageId(pageId: string) {
  _pageId = pageId
}

const mwsBlockDef = defineBlockPlugin({
  key: "mwsTable",
  spec: MwsTableBlockSpec(),
  slashItem: defineSlashItem(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor: any) => ({
      title: "MWS Table",
      badge: "⌘-⌥-1",
      onItemClick: () => {
        const cursorBlock = editor.getTextCursorPosition().block
        editor.insertBlocks(
          [{ type: "mwsTable", props: { pageId: _pageId, blockId: crypto.randomUUID(), dstId: "", viewId: "", filterByFormula: "", pageSize: 50, refreshIntervalSeconds: 30, allowEditBack: false } }],
          cursorBlock,
          "after",
        )
      },
      aliases: ["mws", "table", "fusion", "datasheet"],
      group: "Integrations",
      icon: createElement(TableIcon),
      subtext: "Embed a live MWS Tables datasheet",
    }),
  ),
})

export const mwsTablePlugin = definePlugin({
  id: "mws-table",
  blocks: [mwsBlockDef.block],
  slashItems: mwsBlockDef.slashItem ? [mwsBlockDef.slashItem] : [],
})
