import { createExtension } from "@blocknote/core"
import type { ShortcutDef } from "./types"

/**
 * A keyboard shortcut handler matching BlockNote's `Extension.keyboardShortcuts` signature.
 * The key format follows ProseMirror conventions: `"Mod-Enter"`, `"Shift-Ctrl-Space"`, etc.
 * Return `true` to mark the event as handled.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ShortcutHandler = (ctx: { editor: any }) => boolean

/**
 * Define a keyboard-shortcut plugin contribution.
 *
 * @example
 * const myShortcut = defineShortcut({
 *   key: "my-plugin-shortcuts",
 *   shortcuts: {
 *     "Mod-Alt-c": ({ editor }) => {
 *       // eslint-disable-next-line @typescript-eslint/no-explicit-any
 *       const cursorBlock = (editor as any).getTextCursorPosition().block
 *       // eslint-disable-next-line @typescript-eslint/no-explicit-any
 *       ;(editor as any).insertBlocks([{ type: "callout" }], cursorBlock, "after")
 *       return true
 *     },
 *   },
 * })
 */
export function defineShortcut(options: {
  key: string
  shortcuts: Record<string, ShortcutHandler>
}): ShortcutDef {
  return {
    key: options.key,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extension: createExtension({
      key: options.key,
      keyboardShortcuts: options.shortcuts as Record<string, (ctx: { editor: { getTextCursorPosition: () => unknown } }) => boolean>,
    } as any),
  }
}
