"use client"

import { useMemo } from "react"
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core"
import type { SnipeterPlugin, PluginRuntime } from "../types"
import { composePlugins } from "./composePlugins"

export interface PluginBuild {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: BlockNoteSchema<any, any, any>
  runtime: PluginRuntime
}

/**
 * Build a schema + runtime from a plugin list at **module scope** (outside any
 * React component or hook).
 *
 * `BlockNoteSchema.create` accesses ProseMirror's node-type registry
 * synchronously at call time — it must not be deferred by React (useMemo,
 * useEffect, lazy initializers, etc.).
 *
 * Call this once at the top of the file that mounts the editor, then pass the
 * result to `usePluginRuntime`.
 *
 * @example
 * // wiki-editor.tsx — module scope
 * const wikiPlugins = [mwsTablePlugin, calloutPlugin]
 * const wikiBuild = buildPluginRuntime(wikiPlugins)
 *
 * // inside WikiEditor component:
 * const { schema, runtime } = usePluginRuntime(wikiBuild)
 */
export function buildPluginRuntime(
  plugins: SnipeterPlugin[],
  options?: {
    /** Extra inline-content specs merged alongside the BlockNote defaults. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inlineContentSpecs?: Record<string, any>
  },
): PluginBuild {
  const runtime = composePlugins(plugins)
  const schema = BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      ...runtime.blockSpecs,
    },
    ...(options?.inlineContentSpecs
      ? {
          inlineContentSpecs: {
            ...defaultInlineContentSpecs,
            ...options.inlineContentSpecs,
          },
        }
      : {}),
  })
  return { schema, runtime }
}

/**
 * React hook that returns a stable `{ schema, runtime }` build.
 *
 * Pass a pre-built `PluginBuild` (from `buildPluginRuntime` called at module
 * scope) so the schema reference is stable across renders without going through
 * React's reconciliation.
 *
 * @example
 * // Module scope — outside the component:
 * const wikiBuild = buildPluginRuntime([calloutPlugin])
 *
 * // Inside the component:
 * const { schema, runtime } = usePluginRuntime(wikiBuild)
 * const editor = useCreateBlockNote({ schema, extensions: runtime.extensions }, [schema])
 */
export function usePluginRuntime(build: PluginBuild): PluginBuild {
  // Memoize for referential stability only — schema is already stable in build
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => build, [build.schema])
}
