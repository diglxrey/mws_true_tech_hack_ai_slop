import type { DefaultReactSuggestionItem } from "@blocknote/react"
export type { DefaultReactSuggestionItem }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBlockSpec = any

/**
 * A registered block type: BlockNote spec + the key under which it is placed
 * in the schema's `blockSpecs` map.
 */
export interface BlockPluginDef {
  /** Key used in BlockNoteSchema.create({ blockSpecs: { [key]: spec } }) */
  key: string
  /** Result of createReactBlockSpec() */
  spec: AnyBlockSpec
}

/**
 * A factory that receives the active editor instance and returns a slash-menu item.
 * Using a factory (rather than a plain item) allows `onItemClick` to close over
 * the editor — required because BlockNote types `onItemClick` as `() => void`
 * with no arguments.
 *
 * @example
 * const calloutSlashItem: SlashItemDef = (editor) => ({
 *   title: "Callout",
 *   onItemClick: () => editor.insertBlocks([...], ...),
 *   aliases: ["callout", "note"],
 *   group: "Basic",
 * })
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SlashItemDef = (editor: any) => DefaultReactSuggestionItem

/**
 * A custom suggestion trigger (like `[[` for wiki links or `#` for tags).
 */
export interface SuggestionTriggerDef {
  /** The character sequence that opens this menu (e.g. "[[", "#", "@") */
  triggerCharacter: string
  /** Returns suggestions for the given query string */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getItems: (editor: any, query: string) => Promise<DefaultReactSuggestionItem[]> | DefaultReactSuggestionItem[]
  /** Optional floating UI configuration forwarded to SuggestionMenuController */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  floatingUIOptions?: any
}

/** A set of keyboard shortcuts contributed by a plugin. */
export interface ShortcutDef {
  /** Unique key for the createExtension call */
  key: string
  /**
   * The value returned by `createExtension()` from `@blocknote/core`.
   * Typed as `unknown` here to avoid coupling to BlockNote's internal generics;
   * the host editor passes it directly into `useCreateBlockNote({ extensions })`.
   */
  extension: unknown
}

/** Lifecycle hooks a plugin can subscribe to. */
export interface LifecycleHooks {
  /** Called when a block whose type matches this plugin's block keys is inserted. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBlockInsert?: (block: any, editor: any) => void
  /** Called when the editor mounts. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEditorMount?: (editor: any) => void
  /** Called when the editor unmounts. */
  onEditorUnmount?: () => void
}

/**
 * The complete description of a Snipeter editor plugin.
 * Build one with `definePlugin()`.
 */
export interface SnipeterPlugin {
  /** Unique identifier for this plugin (e.g. "callout", "mws-table"). */
  id: string
  /** Block types registered by this plugin. */
  blocks?: BlockPluginDef[]
  /** Slash-menu items contributed by this plugin. */
  slashItems?: SlashItemDef[]
  /** Custom suggestion triggers (beyond `/`) contributed by this plugin. */
  triggers?: SuggestionTriggerDef[]
  /** Keyboard-shortcut extensions contributed by this plugin. */
  shortcuts?: ShortcutDef[]
  /** Lifecycle hooks. */
  hooks?: LifecycleHooks
}

/**
 * The composed result of `composePlugins()` / `usePluginRuntime()`.
 */
export interface PluginRuntime {
  /** Block specs to spread into BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, ...blockSpecs } }) */
  blockSpecs: Record<string, AnyBlockSpec>
  /**
   * Extensions to pass to `useCreateBlockNote({ extensions })`.
   * Typed as `unknown[]` to avoid coupling to BlockNote's internal generics.
   */
  extensions: unknown[]
  /**
   * Returns the resolved slash-menu items from all plugins for the given editor.
   * Merge with getDefaultReactSlashMenuItems(editor) in the host component.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getExtraSlashItems: (editor: any) => DefaultReactSuggestionItem[]
  /** Extra suggestion triggers (render as additional SuggestionMenuControllers). */
  triggers: SuggestionTriggerDef[]
  /** Lifecycle hooks merged from all plugins (call at appropriate points in the host). */
  hooks: Required<LifecycleHooks>
}
