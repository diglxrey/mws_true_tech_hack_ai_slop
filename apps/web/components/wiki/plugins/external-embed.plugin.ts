import { definePlugin, defineBlockPlugin, defineSlashItem } from "@snipeter/editor-sdk"
import { createElement } from "react"
import { ExternalEmbedBlockSpec } from "../blocks/external-embed-block"

function CodeIcon() {
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
    createElement("polyline", { points: "16 18 22 12 16 6" }),
    createElement("polyline", { points: "8 6 2 12 8 18" }),
  )
}

const embedBlockDef = defineBlockPlugin({
  key: "externalEmbed",
  spec: ExternalEmbedBlockSpec(),
  slashItem: defineSlashItem(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor: any) => ({
      title: "Embed",
      badge: "⌘-⌥-2",
      onItemClick: () => {
        const cursorBlock = editor.getTextCursorPosition().block
        editor.insertBlocks(
          [{ type: "externalEmbed", props: { url: "", embedType: "iframe", height: 400 } }],
          cursorBlock,
          "after",
        )
      },
      aliases: ["embed", "youtube", "figma", "maps", "image", "gif", "vk", "rutube", "iframe", "link"],
      group: "Integrations",
      icon: createElement(CodeIcon),
      subtext: "Paste URL for video, maps, images, or link preview",
    }),
  ),
})

export const externalEmbedPlugin = definePlugin({
  id: "external-embed",
  blocks: [embedBlockDef.block],
  slashItems: embedBlockDef.slashItem ? [embedBlockDef.slashItem] : [],
})
