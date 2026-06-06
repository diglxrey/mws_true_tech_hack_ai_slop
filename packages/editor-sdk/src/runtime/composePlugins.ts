import type { SnipeterPlugin, PluginRuntime } from "../types"

/**
 * Merge an array of plugins into a single `PluginRuntime` object that can be
 * consumed by a BlockNote host editor.
 *
 * Typically called once outside a React component (or inside `useMemo`) to keep
 * the schema stable across re-renders.
 *
 * @example
 * const runtime = composePlugins([calloutPlugin, myTablePlugin])
 *
 * // In the host editor component:
 * const schema = BlockNoteSchema.create({
 *   blockSpecs: { ...defaultBlockSpecs, ...runtime.blockSpecs },
 * })
 * const editor = useCreateBlockNote({ schema, extensions: runtime.extensions }, [...])
 */
export function composePlugins(plugins: SnipeterPlugin[]): PluginRuntime {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blockSpecs: Record<string, any> = {}
  const extensions: unknown[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slashItemFactories: Array<(editor: any) => any> = []

  const onBlockInsertHandlers: NonNullable<SnipeterPlugin["hooks"]>["onBlockInsert"][] = []
  const onEditorMountHandlers: NonNullable<SnipeterPlugin["hooks"]>["onEditorMount"][] = []
  const onEditorUnmountHandlers: NonNullable<SnipeterPlugin["hooks"]>["onEditorUnmount"][] = []

  for (const plugin of plugins) {
    for (const block of plugin.blocks ?? []) {
      blockSpecs[block.key] = block.spec
    }
    for (const shortcut of plugin.shortcuts ?? []) {
      extensions.push(shortcut.extension)
    }
    slashItemFactories.push(...(plugin.slashItems ?? []))

    if (plugin.hooks?.onBlockInsert) onBlockInsertHandlers.push(plugin.hooks.onBlockInsert)
    if (plugin.hooks?.onEditorMount) onEditorMountHandlers.push(plugin.hooks.onEditorMount)
    if (plugin.hooks?.onEditorUnmount) onEditorUnmountHandlers.push(plugin.hooks.onEditorUnmount)
  }

  const triggers = plugins.flatMap((p) => p.triggers ?? [])

  return {
    blockSpecs,
    extensions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getExtraSlashItems: (editor: any) => slashItemFactories.map((f) => f(editor)),
    triggers,
    hooks: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onBlockInsert: (block: any, editor: any) => {
        for (const h of onBlockInsertHandlers) h?.(block, editor)
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onEditorMount: (editor: any) => {
        for (const h of onEditorMountHandlers) h?.(editor)
      },
      onEditorUnmount: () => {
        for (const h of onEditorUnmountHandlers) h?.()
      },
    },
  }
}
