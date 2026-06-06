import type {
  SnipeterPlugin,
  BlockPluginDef,
  SlashItemDef,
  SuggestionTriggerDef,
  ShortcutDef,
  LifecycleHooks,
} from "./types"

/**
 * Assemble a `SnipeterPlugin` from its constituent parts.
 *
 * @example
 * export const calloutPlugin = definePlugin({
 *   id: "callout",
 *   blocks: [calloutBlockDef.block],
 *   slashItems: [calloutBlockDef.slashItem],
 *   shortcuts: [calloutShortcut],
 *   hooks: {
 *     onBlockInsert: (block) => console.debug("callout inserted", block.id),
 *   },
 * })
 */
export function definePlugin(options: {
  id: string
  blocks?: BlockPluginDef[]
  slashItems?: SlashItemDef[]
  triggers?: SuggestionTriggerDef[]
  shortcuts?: ShortcutDef[]
  hooks?: LifecycleHooks
}): SnipeterPlugin {
  return {
    id: options.id,
    blocks: options.blocks ?? [],
    slashItems: options.slashItems ?? [],
    triggers: options.triggers ?? [],
    shortcuts: options.shortcuts ?? [],
    hooks: options.hooks ?? {},
  }
}
