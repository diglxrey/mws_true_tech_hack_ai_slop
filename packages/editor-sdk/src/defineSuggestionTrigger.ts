import type { SuggestionTriggerDef } from "./types"

/**
 * Define a custom suggestion trigger (autocomplete menu opened by a character sequence).
 * Mirrors how the wiki editor implements `[[` for page links and `#` for tags.
 *
 * @example
 * const mentionTrigger = defineSuggestionTrigger({
 *   triggerCharacter: "@",
 *   getItems: async (editor, query) => {
 *     const users = await fetchUsers(query)
 *     return users.map(u => ({
 *       title: u.name,
 *       onItemClick: () => editor.insertInlineContent(`@${u.name} `),
 *     }))
 *   },
 * })
 */
export function defineSuggestionTrigger(def: SuggestionTriggerDef): SuggestionTriggerDef {
  return def
}
