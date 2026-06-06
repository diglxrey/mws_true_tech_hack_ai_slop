import { definePlugin, defineBlockPlugin } from "@snipeter/editor-sdk"
import { calloutBlockSpec } from "./CalloutBlock"
import { calloutSlashItem } from "./slashItem"
import { calloutShortcut } from "./shortcut"

const calloutBlockDef = defineBlockPlugin({
  key: "callout",
  spec: calloutBlockSpec(),
  slashItem: calloutSlashItem,
  shortcut: calloutShortcut,
})

/**
 * Callout block plugin for the Snipeter editor.
 *
 * Provides:
 * - A "callout" block type with `variant` (note/tip/warning/danger), `icon`, and `collapsed` props.
 * - Inline editable content inside the callout.
 * - A slash-menu item (`/callout`) with badge `⌘-⌥-C`.
 * - Keyboard shortcut `Mod-Alt-C` to insert a callout.
 * - A settings gear that opens `BlockSettingsDialog` for per-block configuration.
 *
 * @example
 * import { calloutPlugin } from "@snipeter/plugin-callout"
 * import { usePluginRuntime } from "@snipeter/editor-sdk"
 *
 * const PLUGINS = [calloutPlugin]
 *
 * function Editor() {
 *   const { schema, runtime } = usePluginRuntime(PLUGINS)
 *   // ...
 * }
 */
export const calloutPlugin = definePlugin({
  id: "callout",
  blocks: [calloutBlockDef.block],
  slashItems: calloutBlockDef.slashItem ? [calloutBlockDef.slashItem] : [],
  shortcuts: calloutBlockDef.shortcut ? [calloutBlockDef.shortcut] : [],
  hooks: {
    onBlockInsert: (block, _editor) => {
      if (block.type === "callout") {
        console.debug("[callout-plugin] callout block inserted", { id: block.id, props: block.props })
      }
    },
  },
})

// Named exports for advanced use
export { calloutBlockSpec } from "./CalloutBlock"
export { calloutSlashItem } from "./slashItem"
export { calloutShortcut } from "./shortcut"
