import { defineShortcut } from "@snipeter/editor-sdk"

/**
 * Keyboard shortcut for inserting a callout block.
 * Mac:     Cmd-Option-C
 * Windows/Linux: Ctrl-Alt-C
 *
 * Matches the badge displayed in the slash-menu item.
 */
export const calloutShortcut = defineShortcut({
  key: "callout-insert",
  shortcuts: {
    "Mod-Alt-c": ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = editor as any
      const cursorBlock = e.getTextCursorPosition().block
      e.insertBlocks(
        [{ type: "callout", props: { variant: "note", icon: "", collapsed: false } }],
        cursorBlock,
        "after",
      )
      return true
    },
  },
})
