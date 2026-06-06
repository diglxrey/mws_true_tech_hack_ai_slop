import { definePlugin, defineSlashItem } from "@snipeter/editor-sdk"
import { createElement } from "react"

function SparklesIcon() {
  return createElement(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: 18,
      height: 18,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    createElement("path", { d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" }),
    createElement("path", { d: "M20 3v4" }),
    createElement("path", { d: "M22 5h-4" }),
    createElement("path", { d: "M4 17v2" }),
    createElement("path", { d: "M5 18H3" }),
  )
}

/**
 * Callback to show the AI menu — set by the host editor component.
 * Read at invocation time so it always reflects the current component state.
 */
let _onShowAi: (() => void) | null = null
export function setAiShowCallback(cb: () => void) {
  _onShowAi = cb
}

export const aiGeneratePlugin = definePlugin({
  id: "ai-generate",
  slashItems: [
    defineSlashItem(
      // AI item doesn't need the editor, but the factory signature is uniform
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_editor: any) => ({
        title: "AI Generate",
        badge: "⌘-⌥-3",
        onItemClick: () => _onShowAi?.(),
        aliases: ["ai", "generate"],
        group: "AI",
        icon: createElement(SparklesIcon),
        subtext: "Generate content with AI",
      }),
    ),
  ],
})
