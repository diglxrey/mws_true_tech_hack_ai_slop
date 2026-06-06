import type { DefaultReactSuggestionItem } from "@blocknote/react"
import type { SlashItemDef } from "./types"

/**
 * Define a slash-menu item factory.
 *
 * BlockNote types `onItemClick` as `() => void` (no arguments), so the editor
 * reference must be captured via a closure. Pass a **factory function** that
 * receives the editor and returns the menu item with an `onItemClick` that
 * closes over it.
 *
 * @example
 * const calloutSlashItem = defineSlashItem((editor) => ({
 *   title: "Callout",
 *   aliases: ["note", "tip", "warning"],
 *   group: "Basic",
 *   badge: "⌘-⌥-C",
 *   icon: <InfoIcon size={18} />,
 *   subtext: "A highlighted callout box",
 *   onItemClick: () => {
 *     const cursorBlock = editor.getTextCursorPosition().block
 *     editor.insertBlocks([{ type: "callout" }], cursorBlock, "after")
 *   },
 * }))
 */
export function defineSlashItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  factory: (editor: any) => DefaultReactSuggestionItem,
): SlashItemDef {
  return factory
}
