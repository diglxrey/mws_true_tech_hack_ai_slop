import type { BlockPluginDef, SlashItemDef, ShortcutDef } from "./types"

/**
 * Define a block type for registration in the plugin system.
 *
 * Pass the result of `createReactBlockSpec()` along with the key it should be
 * registered under.  Optionally attach a slash-menu item and/or a keyboard
 * shortcut that inserts the block.
 *
 * @example
 * import { createReactBlockSpec } from "@blocknote/react"
 * import { defineBlockPlugin } from "@snipeter/editor-sdk"
 *
 * // createReactBlockSpec returns a FACTORY — call it with () to get the actual spec:
 * const calloutFactory = createReactBlockSpec(
 *   { type: "callout", propSchema: { variant: { default: "note" } }, content: "inline" },
 *   { render: ({ block, contentRef }) => <CalloutRenderer block={block} contentRef={contentRef} /> }
 * )
 *
 * export const calloutBlockDef = defineBlockPlugin({
 *   key: "callout",
 *   spec: calloutFactory(),  // ← must call () to get the BlockSpec
 * })
 */
export function defineBlockPlugin(options: {
  /** The key used in `blockSpecs` (e.g. "callout", "mwsTable") */
  key: string
  /**
   * The resolved BlockSpec — i.e. the result of **calling** the factory that
   * `createReactBlockSpec()` returns: `myBlockFactory()`.
   *
   * `createReactBlockSpec` returns a factory `(options?) => BlockSpec`, NOT the
   * spec directly. Always call it with `()` before passing it here.
   * Typed as `any` to avoid coupling to BlockNote's complex internal generics.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: any
  /** Optional slash-menu item for inserting this block. */
  slashItem?: SlashItemDef
  /** Optional keyboard shortcut for inserting this block. */
  shortcut?: ShortcutDef
}): {
  block: BlockPluginDef
  slashItem?: SlashItemDef
  shortcut?: ShortcutDef
} {
  return {
    block: { key: options.key, spec: options.spec },
    slashItem: options.slashItem,
    shortcut: options.shortcut,
  }
}
