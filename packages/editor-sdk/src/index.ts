// Factory helpers
export { definePlugin } from "./definePlugin"
export { defineBlockPlugin } from "./defineBlockPlugin"
export { defineSlashItem } from "./defineSlashItem"
export { defineSuggestionTrigger } from "./defineSuggestionTrigger"
export { defineShortcut } from "./defineShortcut"

// Runtime
export { composePlugins } from "./runtime/composePlugins"
export { buildPluginRuntime, usePluginRuntime } from "./runtime/usePluginRuntime"
export type { PluginBuild } from "./runtime/usePluginRuntime"

// UI primitives
export { BlockSettingsDialog } from "./ui/BlockSettingsDialog"

// Types
export type {
  SnipeterPlugin,
  BlockPluginDef,
  SlashItemDef,
  SuggestionTriggerDef,
  ShortcutDef,
  LifecycleHooks,
  PluginRuntime,
} from "./types"
