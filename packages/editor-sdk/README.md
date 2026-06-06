# @snipeter/editor-sdk

Plugin SDK for the Snipeter block editor (built on [BlockNote](https://www.blocknotejs.org/)).

## Installation

```bash
npm install @snipeter/editor-sdk @blocknote/core @blocknote/react react react-dom
```

## Quick start

```ts
// my-plugin/index.ts
import { createReactBlockSpec } from "@blocknote/react"
import {
  definePlugin,
  defineBlockPlugin,
  defineSlashItem,
  defineShortcut,
} from "@snipeter/editor-sdk"

const mySpec = createReactBlockSpec(
  {
    type: "my-block" as const,
    propSchema: { message: { default: "Hello" } },
    content: "none",
  },
  {
    render: ({ block }) => <div>{block.props.message}</div>,
  },
)

const myBlockDef = defineBlockPlugin({
  key: "myBlock",
  spec: mySpec,
  slashItem: defineSlashItem({
    title: "My Block",
    aliases: ["my", "block"],
    group: "Custom",
    icon: <span>⭐</span>,
    subtext: "Insert my custom block",
    onItemClick: (editor) =>
      editor.insertBlocks([{ type: "my-block" }], editor.getTextCursorPosition().block, "after"),
  }),
  shortcut: defineShortcut({
    key: "my-block-insert",
    shortcuts: {
      "Mod-Alt-m": ({ editor }) => {
        editor.insertBlocks([{ type: "my-block" }], editor.getTextCursorPosition().block, "after")
        return true
      },
    },
  }),
})

export const myPlugin = definePlugin({
  id: "my-plugin",
  blocks: [myBlockDef.block],
  slashItems: myBlockDef.slashItem ? [myBlockDef.slashItem] : [],
  shortcuts: myBlockDef.shortcut ? [myBlockDef.shortcut] : [],
  hooks: {
    onBlockInsert: (block) => console.debug("inserted", block),
  },
})
```

### Registering plugins in the host editor

```tsx
"use client"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/mantine"
import { filterSuggestionItems, getDefaultReactSlashMenuItems, SuggestionMenuController } from "@blocknote/react"
import { usePluginRuntime } from "@snipeter/editor-sdk"
import { myPlugin } from "./my-plugin"

const PLUGINS = [myPlugin]

export function MyEditor() {
  const { schema, runtime } = usePluginRuntime(PLUGINS)

  const editor = useCreateBlockNote({ schema, extensions: runtime.extensions }, [schema])

  return (
    <BlockNoteView editor={editor} slashMenu={false}>
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            [...getDefaultReactSlashMenuItems(editor), ...runtime.getExtraSlashItems(editor)],
            query,
          )
        }
      />
      {runtime.triggers.map((trigger) => (
        <SuggestionMenuController
          key={trigger.triggerCharacter}
          triggerCharacter={trigger.triggerCharacter}
          getItems={async (query) => trigger.getItems(editor, query)}
          {...(trigger.floatingUIOptions ?? {})}
        />
      ))}
    </BlockNoteView>
  )
}
```

### BlockSettingsDialog

A zero-dependency settings overlay for blocks that need per-instance configuration:

```tsx
import { BlockSettingsDialog } from "@snipeter/editor-sdk"

function MyBlockRenderer({ block, editor }) {
  const [open, setOpen] = useState(false)
  return (
    <div contentEditable={false}>
      <button onClick={() => setOpen(true)}>⚙ Settings</button>
      <BlockSettingsDialog open={open} onClose={() => setOpen(false)} title="My Block Settings">
        <label>Message</label>
        <input
          value={block.props.message}
          onChange={(e) => editor.updateBlock(block, { props: { message: e.target.value } })}
        />
      </BlockSettingsDialog>
    </div>
  )
}
```

## API

| Export | Description |
|---|---|
| `definePlugin(options)` | Assemble a `SnipeterPlugin` from its parts |
| `defineBlockPlugin(options)` | Create a block registration with optional slash item + shortcut |
| `defineSlashItem(item)` | Typed factory for a slash-menu item |
| `defineSuggestionTrigger(def)` | Define a custom autocomplete trigger character |
| `defineShortcut(options)` | Define keyboard shortcuts via `createExtension` |
| `composePlugins(plugins)` | Merge plugins into a `PluginRuntime` (non-hook version) |
| `usePluginRuntime(plugins)` | React hook — returns `{ schema, runtime }` |
| `BlockSettingsDialog` | Generic per-block settings dialog component |

## Important: client-only

All SDK components assume a browser environment. In Next.js App Router:

```tsx
// page.tsx (server component)
const Editor = dynamic(() => import("./MyEditor"), { ssr: false })
```
