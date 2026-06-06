"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"
import {
  createExtension,
  filterSuggestionItems,
  type BlockNoteEditor,
} from "@blocknote/core"
import {
  BlockNoteView,
} from "@blocknote/mantine"
import {
  type DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react"
import "@blocknote/mantine/style.css"
import "./wiki-collab-cursors.css"
import "./custom-suggestion-menu.css"
import { MessageSquareIcon, HistoryIcon, SparklesIcon, TableIcon, WifiOffIcon, CheckIcon, Loader2Icon, FilePlusIcon, HashIcon } from "lucide-react"
import { useSession } from "next-auth/react"
import { useTheme } from "next-themes"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { api } from "@/lib/api"
import { getCollaborationUser, presenceInitials } from "@/lib/wiki-collab-user"
import type { WikiInlineMwsAggregateBinding, WikiInlineMwsSnippetBinding, WikiPageRow, WikiTag } from "@/lib/wiki-types"
import { WS_CLOSE_UNAUTHORIZED } from "@/lib/wiki-ws-url"
import { getWikiCollabWsUrl, getWikiCollabToken } from "@/lib/wiki-ws-url"
import { buildPluginRuntime, usePluginRuntime } from "@snipeter/editor-sdk"
import type { SnipeterPlugin } from "@snipeter/editor-sdk"
import { calloutPlugin } from "@snipeter/plugin-callout"
import { mwsTablePlugin, setMwsPageId } from "./plugins/mws-table.plugin"
import { externalEmbedPlugin } from "./plugins/external-embed.plugin"
import { aiGeneratePlugin, setAiShowCallback } from "./plugins/ai-generate.plugin"
import { MwsAggregateInlineSnippetSpec, WikiMwsAggregateSnippetConfigModal } from "./inline/mws-inline-aggregate-snippet"
import { MwsInlineSnippetSpec, WikiMwsSnippetConfigModal } from "./inline/mws-inline-snippet"
import { WikiCommentPanel } from "./wiki-comment-panel"
import { WikiVersionPanel } from "./wiki-version-panel"
import { WikiAiFloatingMenu } from "./wiki-ai-floating-menu"

interface Props {
  pageId: string
  initialPage: WikiPageRow | null
  /** Extra plugins to register on top of the built-in wiki plugins. */
  extraPlugins?: SnipeterPlugin[]
}

const WIKI_PAGE_TITLE_UPDATED_EVENT = "wiki:page-title-updated"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WikiEditor = BlockNoteEditor<any, any, any>
type SlashMenuItem = DefaultReactSuggestionItem
type PlatformKind = "mac" | "windows" | "linux" | "other"

// Built-in keyboard shortcuts registered via the plugin system
const wikiShortcutExtension = createExtension({
  key: "wiki-keyboard-shortcuts",
  keyboardShortcuts: {
    // Mod-/ → toggle code block (like Notion / VS Code)
    "Mod-/": ({ editor }) => {
      const { block } = editor.getTextCursorPosition()
      if (block.type === "codeBlock") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(editor as any).updateBlock(block, { type: "paragraph", props: {} })
      } else if (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (editor.schema.blockSchema as any)[block.type]?.content === "inline"
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(editor as any).updateBlock(block, { type: "codeBlock", props: {} })
      }
      return true
    },
    // Mod-Enter → toggle checked state on checkListItem (like Notion)
    "Mod-Enter": ({ editor }) => {
      const { block } = editor.getTextCursorPosition()
      if (block.type === "checkListItem") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(editor as any).updateBlock(block, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          props: { checked: !(block.props as any).checked },
        })
        return true
      }
      return false
    },
  },
})

/** Default plugins every wiki editor instance registers. */
const WIKI_BUILTIN_PLUGINS: SnipeterPlugin[] = [
  mwsTablePlugin,
  externalEmbedPlugin,
  aiGeneratePlugin,
  calloutPlugin,
]

/**
 * Pre-built schema + runtime at module scope.
 * BlockNoteSchema.create must NOT be called inside a React component or hook
 * (even inside useMemo) — it accesses ProseMirror's node-type registry
 * synchronously at call time.
 */
const wikiDefaultBuild = buildPluginRuntime(WIKI_BUILTIN_PLUGINS, {
  inlineContentSpecs: {
    mwsSnippet: MwsInlineSnippetSpec,
    mwsAggregateSnippet: MwsAggregateInlineSnippetSpec,
  },
})

type SaveStatus = "idle" | "saving" | "saved" | "offline" | "error"

const DRAFT_KEY = (pageId: string) => `wiki:draft:${pageId}`
const AUTOSAVE_DEBOUNCE_MS = 1500

type PresencePeer = { clientId: number; name: string; color: string; isSelf: boolean }

/**
 * Check if a KeyboardEvent matches the badge shortcut text displayed in the
 * suggestion-menu item (e.g. "⌘-Alt-1" or "Ctrl-Shift-7").
 * BlockNote formats badges with "-" separators via formatKeyboardShortcut().
 */
function matchesBadgeShortcut(event: KeyboardEvent, badge: string | undefined): boolean {
  if (!badge) return false
  // Badge uses "-" separator (e.g. "⌘-Alt-1"); also tolerate "+" just in case.
  const parts = badge.split(/[-+]/).map((p) => p.trim().toLowerCase())

  let needsMeta = false
  let needsCtrl = false
  let needsShift = false
  let needsAlt = false
  let expectedKey = ""

  for (const part of parts) {
    if (part === "⌘" || part === "cmd") needsMeta = true
    else if (part === "ctrl" || part === "control" || part === "⌃") needsCtrl = true
    else if (part === "shift" || part === "⇧") needsShift = true
    else if (part === "alt" || part === "option" || part === "opt" || part === "⌥") needsAlt = true
    else expectedKey = part
  }

  // Modifier checks
  if (needsMeta && !event.metaKey) return false
  if (needsCtrl && !event.ctrlKey) return false
  if (!needsMeta && !needsCtrl && (event.metaKey || event.ctrlKey)) return false
  if (needsShift !== event.shiftKey) return false
  if (needsAlt !== event.altKey) return false

  // Key check — use event.code to avoid locale / modifier remapping
  const eventKey = event.key.toLowerCase()
  return (
    eventKey === expectedKey ||
    event.code.toLowerCase() === `key${expectedKey}` ||
    event.code.toLowerCase() === `digit${expectedKey}`
  )
}

function detectPlatform(): PlatformKind {
  if (typeof navigator === "undefined") return "other"

  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    ?? navigator.platform
    ?? navigator.userAgent
  if (/mac/i.test(platform)) return "mac"
  if (/win/i.test(platform)) return "windows"
  if (/linux|x11/i.test(platform)) return "linux"
  return "other"
}

function getSlashShortcutBadge(platform: PlatformKind, key: string): string {
  if (platform === "mac") {
    return `⌘-⌥-${key}`
  }

  return `Ctrl-Alt-${key}`
}

export function WikiEditor({ pageId, initialPage, extraPlugins = [] }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const { resolvedTheme } = useTheme()
  const collaborationUser = useMemo(() => getCollaborationUser(session ?? null), [session])
  const platform = useMemo(() => detectPlatform(), [])

  // Use the module-scope pre-built schema+runtime (safe: BlockNoteSchema.create
  // was called at module level, not inside React). extraPlugins' block types
  // are not supported at runtime — pass them at module scope via WIKI_BUILTIN_PLUGINS.
  const { schema, runtime } = usePluginRuntime(wikiDefaultBuild)
  const [page, setPage] = useState<WikiPageRow | null>(initialPage)
  const [title, setTitle] = useState(initialPage?.title ?? "Untitled")
  const [linkedPages, setLinkedPages] = useState<WikiPageRow[]>([])
  const [backlinks, setBacklinks] = useState<WikiPageRow[]>([])
  const [allPages, setAllPages] = useState<WikiPageRow[]>([])
  const [showComments, setShowComments] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [showSnippetConfig, setShowSnippetConfig] = useState(false)
  const [showAggregateSnippetConfig, setShowAggregateSnippetConfig] = useState(false)
  const [snippetDraftBinding, setSnippetDraftBinding] = useState<WikiInlineMwsSnippetBinding>({
    dstId: "",
    viewId: "",
    pkColumn: "",
    pkValue: "",
    valueColumn: "",
    recordId: "",
  })
  const [aggregationDraftBinding, setAggregationDraftBinding] = useState<WikiInlineMwsAggregateBinding>({
    dstId: "",
    viewId: "",
    column: "",
    kind: "count",
    filterByFormula: "",
  })

  // Keep plugin singletons up-to-date with component state
  useEffect(() => { setMwsPageId(pageId) }, [pageId])
  useEffect(() => { setAiShowCallback(() => setShowAi(true)) }, [])
  const [draftToast, setDraftToast] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [isOnline, setIsOnline] = useState(true)
  const titleSaveTimer = useRef<NodeJS.Timeout | null>(null)
  const titleValueRef = useRef(initialPage?.title ?? "Untitled")
  const lastSavedTitleRef = useRef(initialPage?.title ?? "Untitled")
  const draftSaveTimer = useRef<NodeJS.Timeout | null>(null)
  const pendingSyncRef = useRef(false)
  const snapshotHydratedRef = useRef(false)
  const [presencePeers, setPresencePeers] = useState<PresencePeer[]>([])

  /* Client navigations can reuse this component without remounting; `key={pageId}` on the loader
     forces a fresh instance, but we still sync from props and clear debounced title saves here. */
  /* eslint-disable react-hooks/set-state-in-effect -- intentional reset when route / server page row changes */
  useEffect(() => {
    setPage(initialPage)
    const nextTitle = initialPage?.title ?? "Untitled"
    setTitle(nextTitle)
    titleValueRef.current = nextTitle
    lastSavedTitleRef.current = nextTitle
    setSaveStatus("idle")
    setDraftToast(false)
    setShowComments(false)
    setShowHistory(false)
    setShowAi(false)
    return () => {
      if (titleSaveTimer.current) {
        clearTimeout(titleSaveTimer.current)
        titleSaveTimer.current = null
      }
    }
  }, [pageId, initialPage])
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadRelatedPages = useCallback(async () => {
    try {
      const [egoGraph, pages, incomingBacklinks] = await Promise.all([
        api.wiki.getEgoGraph(pageId),
        api.wiki.listPages(),
        api.wiki.getBacklinks(pageId),
      ])
      setAllPages(pages)

      const currentPage = pages.find((p) => p.id === pageId)
      if (currentPage) {
        setPage(currentPage)
        const hasPendingTitleSave = Boolean(titleSaveTimer.current)
        const canHydrateTitle = titleValueRef.current === lastSavedTitleRef.current && !hasPendingTitleSave
        if (canHydrateTitle) {
          titleValueRef.current = currentPage.title
          lastSavedTitleRef.current = currentPage.title
          setTitle(currentPage.title)
        }
      }

      const pageNodeIds = new Set(
        egoGraph.nodes
          .filter((node) => node.kind !== "tag")
          .map((node) => node.id),
      )
      pageNodeIds.delete(pageId)

      const outgoingIds = new Set<string>()
      for (const link of egoGraph.links) {
        if (link.source === pageId && pageNodeIds.has(link.target)) {
          outgoingIds.add(link.target)
        }
      }

      const pageById = new Map(pages.map((p) => [p.id, p]))
      const nextLinkedPages = [...outgoingIds]
        .map((id) => pageById.get(id))
        .filter((p): p is WikiPageRow => Boolean(p))
      setLinkedPages(nextLinkedPages)

      const uniqueBacklinks = incomingBacklinks.filter((candidate, index, collection) => {
        return candidate.id !== pageId && collection.findIndex((page) => page.id === candidate.id) === index
      })
      setBacklinks(uniqueBacklinks)
    } catch {
      // ignore
    }
  }, [pageId])

  useEffect(() => {
    void loadRelatedPages()
  }, [loadRelatedPages])

  // Server-provided `initialPage` can be absent in some navigation/auth flows.
  // Ensure the visible title is hydrated from the API instead of sticking to "Untitled".
  useEffect(() => {
    let cancelled = false
    void api.wiki.getPage(pageId).then((freshPage) => {
      if (cancelled) return
      setPage(freshPage)
      setTitle((currentTitle: string) => {
        const hasPendingTitleSave = Boolean(titleSaveTimer.current)
        const canHydrate = currentTitle === lastSavedTitleRef.current && !hasPendingTitleSave
        if (canHydrate) {
          titleValueRef.current = freshPage.title
          lastSavedTitleRef.current = freshPage.title
          return freshPage.title
        }
        return currentTitle
      })
    }).catch(() => {
      // ignore
    })
    return () => {
      cancelled = true
    }
  }, [pageId])

  // Yjs document + WebSocket provider
  const ydoc = useMemo(() => new Y.Doc(), [pageId])
  const wsUrl = useMemo(() => getWikiCollabWsUrl(), [])
  /** Path only — y-websocket appends `?` + params; do not put ?pageId= in the room or `access_token` is lost. */
  const wsRoom = "api/v1/wiki-collab"
  const [wsToken, setWsToken] = useState<string | null | undefined>(undefined)
  const [collabAuthError, setCollabAuthError] = useState(false)
  useEffect(() => {
    setWsToken(undefined)
    setCollabAuthError(false)
    void getWikiCollabToken().then((t) => setWsToken(t))
  }, [pageId])

  const provider = useMemo(() => {
    const params: Record<string, string> = { pageId }
    if (wsToken) params["access_token"] = wsToken
    return new WebsocketProvider(wsUrl, wsRoom, ydoc, {
      WebSocketPolyfill: WebSocket,
      params,
      connect: wsToken != null,
      // y-websocket BroadcastChannel id is `serverUrl + '/' + roomname` only — query params
      // (pageId) are NOT part of the channel id. With a fixed roomname, every wiki page shared
      // one BC and Yjs merged unrelated documents (new page showed another page's content).
      disableBc: true,
    })
  }, [wsUrl, wsRoom, ydoc, wsToken, pageId])

  // Stop y-websocket reconnect loop on definitive auth failure (API JWT reject)
  useEffect(() => {
    const onClose = (event: CloseEvent | null) => {
      if (event?.code === WS_CLOSE_UNAUTHORIZED) {
        provider.shouldConnect = false
        setCollabAuthError(true)
      }
    }
    provider.on("connection-close", onClose)
    return () => {
      // lib0 ObservableV2
      ;(provider as unknown as { off?: (n: string, fn: typeof onClose) => void }).off?.(
        "connection-close",
        onClose,
      )
    }
  }, [provider])

  // Google Docs–style presence: names from Yjs awareness (BlockNote stores `user` on each state).
  useEffect(() => {
    const aw = provider.awareness
    const sync = () => {
      const localId = aw.clientID
      const peers: PresencePeer[] = []
      aw.getStates().forEach((state, clientId) => {
        const raw = state as { user?: { name?: string; color?: string } } | null | undefined
        const u = raw?.user
        const name = typeof u?.name === "string" && u.name.trim() ? u.name.trim() : "Unknown"
        const color = typeof u?.color === "string" && u.color ? u.color : "#888888"
        peers.push({ clientId, name, color, isSelf: clientId === localId })
      })
      peers.sort((a, b) => {
        if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setPresencePeers(peers)
    }
    sync()
    aw.on("change", sync)
    return () => {
      aw.off("change", sync)
    }
  }, [provider])

  // Hydrate document from latest persisted snapshot.
  // This keeps reload working even when WS sync handshake is delayed/interrupted.
  useEffect(() => {
    let cancelled = false
    snapshotHydratedRef.current = false
    void api.wiki.getSnapshot(pageId)
      .then(({ state }) => {
        if (cancelled || !state || snapshotHydratedRef.current) return
        try {
          Y.applyUpdate(ydoc, new Uint8Array(Buffer.from(state, "base64")))
          snapshotHydratedRef.current = true
        } catch {
          // ignore malformed server snapshot; live WS/doc updates still work
        }
      })
      .catch(() => {
        // ignore; websocket sync path can still hydrate the document
      })
    return () => {
      cancelled = true
    }
  }, [pageId, ydoc])

  // Track online/offline status
  useEffect(() => {
    setIsOnline(navigator.onLine)
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setSaveStatus("offline")
    }
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  // When going online — try to sync any pending local draft
  useEffect(() => {
    if (!isOnline || !pendingSyncRef.current) return
    const stored = localStorage.getItem(DRAFT_KEY(pageId))
    if (!stored) return
    try {
      const { state } = JSON.parse(stored) as { state: string; timestamp: number }
      setSaveStatus("saving")
      api.wiki.saveSnapshot(pageId, state)
        .then(() => {
          localStorage.removeItem(DRAFT_KEY(pageId))
          pendingSyncRef.current = false
          setSaveStatus("saved")
          void loadRelatedPages()
        })
        .catch(() => {
          // still offline or server error — keep draft
        })
    } catch {
      // ignore malformed draft
    }
  }, [isOnline, pageId, loadRelatedPages])

  // Check for local draft on mount (recovery from offline session)
  useEffect(() => {
    const stored = localStorage.getItem(DRAFT_KEY(pageId))
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { timestamp: number; state: string }
        const serverTime = page ? new Date(page.updated_at).getTime() : 0
        if (parsed.timestamp > serverTime) {
          setDraftToast(true)
        }
      } catch {
        // ignore malformed draft
      }
    }
  }, [pageId, page])

  function restoreDraft() {
    const stored = localStorage.getItem(DRAFT_KEY(pageId))
    if (!stored) return
    try {
      const { state } = JSON.parse(stored) as { state: string; timestamp: number }
      Y.applyUpdate(ydoc, new Uint8Array(Buffer.from(state, "base64")))
    } catch {
      // ignore
    }
    setDraftToast(false)
  }

  // Autosave to server on every Yjs update; localStorage fallback when offline
  useEffect(() => {
    function onUpdate() {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
      draftSaveTimer.current = setTimeout(() => {
        const stateB64 = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64")

        if (!navigator.onLine) {
          localStorage.setItem(DRAFT_KEY(pageId), JSON.stringify({ state: stateB64, timestamp: Date.now() }))
          pendingSyncRef.current = true
          setSaveStatus("offline")
          return
        }

        setSaveStatus("saving")
        api.wiki.saveSnapshot(pageId, stateB64)
          .then(() => {
            localStorage.removeItem(DRAFT_KEY(pageId))
            pendingSyncRef.current = false
            setSaveStatus("saved")
            void loadRelatedPages()
          })
          .catch(() => {
            // Network failure — keep draft locally
            localStorage.setItem(DRAFT_KEY(pageId), JSON.stringify({ state: stateB64, timestamp: Date.now() }))
            pendingSyncRef.current = true
            setSaveStatus("offline")
          })
      }, AUTOSAVE_DEBOUNCE_MS)
    }
    ydoc.on("update", onUpdate)
    return () => {
      ydoc.off("update", onUpdate)
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
    }
  }, [ydoc, pageId, loadRelatedPages])

  // Destroy only the provider when it is replaced (e.g. ws token loaded). Never destroy `ydoc`
  // in that cleanup — same Y.Doc must stay bound to BlockNote; destroying it breaks live sync.
  useEffect(() => {
    return () => {
      provider.destroy()
    }
  }, [provider])

  useEffect(() => {
    return () => {
      ydoc.destroy()
    }
  }, [ydoc])

  const editor = useCreateBlockNote(
    {
      schema,
      collaboration: {
        provider,
        fragment: ydoc.getXmlFragment("content"),
        user: collaborationUser,
        /* "always" does not set [data-active] in BlockNote — labels stay visually collapsed.
           "activity" shows name on hover + briefly after the peer moves (Google Docs–like). */
        showCursorLabels: "activity",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extensions: [wikiShortcutExtension, ...(runtime.extensions as any[])],
    },
    // Must include `provider`: when the WebSocket connects (token arrives), a new WebsocketProvider
    // replaces the old one. If the editor is not recreated, yCursorPlugin keeps the destroyed
    // provider's awareness — remote cursors and labels never appear.
    // `schema` is included so the editor recreates if the plugin list changes.
    [pageId, collaborationUser.name, collaborationUser.color, provider, schema],
  )

  const getCustomSlashMenuItems = useCallback(
    (e: WikiEditor): SlashMenuItem[] => {
      const defaults = getDefaultReactSlashMenuItems(e)
      const pluginItems = runtime.getExtraSlashItems(e)
      return [...defaults, ...pluginItems]
    },
    [runtime],
  )

  // Keep a ref of the current slash-menu items so the keydown handler below
  // can match badge shortcuts without re-subscribing on every render.
  const slashItemsRef = useRef<SlashMenuItem[]>([])
  useEffect(() => {
    slashItemsRef.current = getCustomSlashMenuItems(editor)
  }, [editor, getCustomSlashMenuItems])

  useEffect(() => {
    const el = editor.domElement
    if (!el) return

    function handleWikiLinkClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      const target = event.target
      if (!(target instanceof HTMLElement)) return

      const anchor = target.closest('a[href^="/wiki/"]')
      if (!(anchor instanceof HTMLAnchorElement)) return

      const href = anchor.getAttribute("href")
      if (!href) return

      event.preventDefault()
      event.stopPropagation()
      router.push(href)
    }

    el.addEventListener("click", handleWikiLinkClick)
    return () => {
      el.removeEventListener("click", handleWikiLinkClick)
    }
  }, [editor, router])

  // When the "/" suggestion menu is open, allow pressing the keyboard shortcut
  // shown in a menu item's badge to trigger that item.
  useEffect(() => {
    const el = editor.domElement
    if (!el) return

    function handleShortcutInMenu(event: KeyboardEvent) {
      // Only act when a modifier key is held (plain keys are handled by BlockNote).
      if (!event.metaKey && !event.ctrlKey && !event.altKey) return

      // Check if a suggestion-menu is currently visible in the DOM.
      const menu = document.querySelector("#bn-suggestion-menu")
      if (!menu) return

      const items = slashItemsRef.current
      for (const item of items) {
        if (matchesBadgeShortcut(event, item.badge)) {
          event.preventDefault()
          event.stopPropagation()
          const targetItem = [...document.querySelectorAll<HTMLElement>("#bn-suggestion-menu [id^='bn-suggestion-menu-item-']")]
            .find((candidate) => candidate.textContent?.includes(item.title))
          targetItem?.click()
          return
        }
      }
    }

    // Use capture phase so we run before BlockNote's own keydown handler.
    el.addEventListener("keydown", handleShortcutInMenu, true)
    return () => {
      el.removeEventListener("keydown", handleShortcutInMenu, true)
    }
  }, [editor])

  const insertInlineText = useCallback((token: string) => {
    editor.insertInlineContent(token)
  }, [editor])

  const insertInlineSnippet = useCallback((binding: WikiInlineMwsSnippetBinding) => {
    editor.insertInlineContent([
      {
        type: "mwsSnippet",
        props: {
          dstId: binding.dstId,
          viewId: binding.viewId ?? "",
          pkColumn: binding.pkColumn,
          pkValue: binding.pkValue,
          valueColumn: binding.valueColumn,
          recordId: binding.recordId ?? "",
        },
      },
      " ",
    ])
  }, [editor])

  const insertInlineAggregationSnippet = useCallback((binding: WikiInlineMwsAggregateBinding) => {
    editor.insertInlineContent([
      {
        type: "mwsAggregateSnippet",
        props: {
          dstId: binding.dstId,
          viewId: binding.viewId ?? "",
          column: binding.column ?? "",
          kind: binding.kind,
          filterByFormula: binding.filterByFormula ?? "",
        },
      },
      " ",
    ])
  }, [editor])

  const insertWikiInlineLink = useCallback((targetId: string, targetTitle: string) => {
    editor.insertInlineContent([
      {
        type: "link",
        href: `/wiki/${targetId}`,
        content: `[[${targetTitle}]]`,
      },
      " ",
    ])
    setLinkedPages((current: WikiPageRow[]) => {
      if (current.some((page: WikiPageRow) => page.id === targetId)) {
        return current
      }

      const nextPage = allPages.find((page: WikiPageRow) => page.id === targetId)
      return nextPage ? [...current, nextPage] : current
    })
  }, [allPages, editor])

  const getUniqueSlug = useCallback((baseName: string, existing: WikiPageRow[]) => {
    const base = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
    let slug = base
    let index = 2
    const existingSlugs = new Set(existing.map((p) => p.slug))
    while (existingSlugs.has(slug)) {
      slug = `${base}-${index}`
      index += 1
    }
    return slug
  }, [])

  const getWikiLinkItems = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim()
    const pages = allPages.length > 0 ? allPages : await api.wiki.listPages()
    const normalized = query.toLowerCase()
    const filtered = pages
      .filter((page: WikiPageRow) => page.id !== pageId)
      .filter((page: WikiPageRow) => !normalized || page.title.toLowerCase().startsWith(normalized) || page.slug.toLowerCase().startsWith(normalized))
      .sort((left: WikiPageRow, right: WikiPageRow) => left.title.localeCompare(right.title))
      .slice(0, 8)

    const items = filtered.map((page: WikiPageRow) => ({
      title: page.title,
      subtext: `[[${page.title}]]`,
      aliases: [page.title, page.slug],
      group: "Pages",
      icon: <MessageSquareIcon size={18} />,
      onItemClick: () => insertWikiInlineLink(page.id, page.title),
    }))

    if (query && filtered.length === 0) {
      items.push({
        title: `Create "${query}"`,
        subtext: `Create page and insert [[${query}]]`,
        aliases: [query],
        group: "Pages",
        icon: <FilePlusIcon size={18} />,
        onItemClick: async () => {
          const knownPages = allPages.length > 0 ? allPages : await api.wiki.listPages()
          const created = await api.wiki.createPage({
            title: query,
            slug: getUniqueSlug(query, knownPages),
          })
          setAllPages((current: WikiPageRow[]) => [...current, created])
          setLinkedPages((current: WikiPageRow[]) => (current.some((page: WikiPageRow) => page.id === created.id) ? current : [...current, created]))
          insertWikiInlineLink(created.id, created.title)
        },
      })
    }

    return items
  }, [allPages, getUniqueSlug, insertWikiInlineLink, pageId])

  const getTagItems = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim().toLowerCase()
    const tags = await api.wiki.listTags(query)
    const filtered = tags.slice(0, 8)
    const items = filtered.map((tag: WikiTag) => ({
      title: `#${tag.name}`,
      subtext: "Existing tag",
      aliases: [tag.name, tag.slug],
      group: "Tags",
      icon: <HashIcon size={18} />,
      onItemClick: () => insertInlineText(`#${tag.name} `),
    }))

    if (query && !filtered.some((tag) => tag.name === query || tag.slug === query)) {
      items.push({
        title: `Create #${query}`,
        subtext: "Create tag and insert hashtag",
        aliases: [query],
        group: "Tags",
        icon: <FilePlusIcon size={18} />,
        onItemClick: async () => {
          const created = await api.wiki.createTag(query)
          insertInlineText(`#${created.name} `)
        },
      })
    }

    return items
  }, [insertInlineText])

  const getMwsSnippetItems = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim()
    return [
      {
        title: query ? `Create MWS snippet for "${query}"` : "Create MWS snippet",
        subtext: "Select datasheet, PK column, PK value, and value column",
        aliases: ["snippet", "mws", "cell", "table", query].filter(Boolean),
        group: "MWS",
        icon: <SparklesIcon size={18} />,
        onItemClick: () => {
          setSnippetDraftBinding((current) => ({
            ...current,
            pkValue: query || current.pkValue,
          }))
          setShowSnippetConfig(true)
        },
      },
      {
        title: query ? `Create aggregation snippet for "${query}"` : "Create aggregation snippet",
        subtext: "Set table, column and aggregation type (count/median/min/max/avg/mode)",
        aliases: ["aggregation", "aggregate", "mode", "median", "avg", "count", query].filter(Boolean),
        group: "MWS",
        icon: <TableIcon size={18} />,
        onItemClick: () => {
          setAggregationDraftBinding((current) => ({
            ...current,
            column: query || current.column,
          }))
          setShowAggregateSnippetConfig(true)
        },
      },
    ]
  }, [])

  async function saveTitle(newTitle: string) {
    const normalizedTitle = newTitle.trim() || "Untitled"
    if (normalizedTitle === lastSavedTitleRef.current) return
    try {
      const updated = await api.wiki.updatePage(pageId, { title: normalizedTitle })
      setPage(updated)
      setTitle(updated.title)
      titleValueRef.current = updated.title
      lastSavedTitleRef.current = updated.title
      window.dispatchEvent(
        new CustomEvent(WIKI_PAGE_TITLE_UPDATED_EVENT, {
          detail: { pageId: updated.id, title: updated.title },
        }),
      )
    } catch {
      // ignore
    }
  }

  function saveTitleBestEffortOnUnload(newTitle: string) {
    const normalizedTitle = newTitle.trim() || "Untitled"
    if (normalizedTitle === lastSavedTitleRef.current) return
    const body = JSON.stringify({ title: normalizedTitle })
    void fetch(`/api/backend/api/v1/wiki/pages/${pageId}`, {
      method: "PATCH",
      cache: "no-store",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {
      // best-effort only; regular autosave already handles normal flow
    })
  }

  function handleTitleChange(newTitle: string) {
    titleValueRef.current = newTitle
    setTitle(newTitle)
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current)
    titleSaveTimer.current = setTimeout(() => void saveTitle(newTitle), 1000)
  }

  function flushTitleSave(explicitTitle?: string) {
    if (titleSaveTimer.current) {
      clearTimeout(titleSaveTimer.current)
      titleSaveTimer.current = null
    }
    void saveTitle(explicitTitle ?? titleValueRef.current)
  }

  useEffect(() => {
    function flushTitleBeforeUnload() {
      if (titleSaveTimer.current) {
        clearTimeout(titleSaveTimer.current)
        titleSaveTimer.current = null
      }
      saveTitleBestEffortOnUnload(titleValueRef.current)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushTitleBeforeUnload()
      }
    }

    window.addEventListener("pagehide", flushTitleBeforeUnload)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      window.removeEventListener("pagehide", flushTitleBeforeUnload)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [pageId])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* Draft recovery toast */}
      {collabAuthError && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Live collaboration disconnected (unauthorized). Check API OIDC settings or sign in again. Editing still works from the last loaded snapshot.
        </div>
      )}
      {draftToast && (
        <div className="flex items-center gap-3 border-b border-border bg-warning/10 px-4 py-2 text-sm">
          <span className="text-foreground">
            You have a local draft newer than the server version.
          </span>
          <Button size="sm" variant="outline" onClick={restoreDraft}>Restore draft</Button>
          <Button size="sm" variant="ghost" onClick={() => {
            localStorage.removeItem(DRAFT_KEY(pageId))
            setDraftToast(false)
          }}>
            Discard
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2">
        {/* Save status indicator */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground select-none">
          {saveStatus === "saving" && (
            <><Loader2Icon className="size-3 animate-spin" /><span>Saving…</span></>
          )}
          {saveStatus === "saved" && (
            <><CheckIcon className="size-3 text-green-500" /><span>Saved</span></>
          )}
          {saveStatus === "offline" && (
            <><WifiOffIcon className="size-3 text-yellow-500" /><span className="text-yellow-600">Offline — saved locally</span></>
          )}
        </div>
        <div className="flex-1" />
        {presencePeers.length > 0 && (
          <div className="flex max-w-[min(280px,45vw)] flex-shrink-0 items-center justify-end overflow-hidden pr-1">
            <div className="flex flex-shrink-0 items-center -space-x-2">
              {presencePeers.map((p) => (
                <span
                  key={p.clientId}
                  title={p.isSelf ? `${p.name} (you)` : p.name}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 border-muted text-[10px] font-semibold text-white shadow-sm"
                  style={{ backgroundColor: p.color }}
                >
                  {presenceInitials(p.name)}
                </span>
              ))}
            </div>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={() => { setShowComments((v) => !v); setShowHistory(false) }} className={cn("text-muted-foreground hover:bg-accent", showComments && "bg-accent")}>
          <MessageSquareIcon className="mr-1.5 size-4" /> Comments
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setShowHistory((v) => !v); setShowComments(false) }} className={cn("text-muted-foreground hover:bg-accent", showHistory && "bg-accent")}>
          <HistoryIcon className="mr-1.5 size-4" /> History
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowAi((v) => !v)} className={cn("text-muted-foreground hover:bg-accent", showAi && "bg-accent")}>
          <SparklesIcon className="mr-1.5 size-4" /> AI
        </Button>
      </div>

      {/* Editor area — min-h-0 so side panels can shrink and scroll inside the viewport */}
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto scroll-pb-48">
          <div className="mx-auto max-w-3xl px-8 pt-8 pb-48">
            {/* Page title */}
            <input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onBlur={(e) => flushTitleSave(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  ;(e.currentTarget as HTMLInputElement).blur()
                }
              }}
              placeholder="Untitled"
              className="mb-4 w-full bg-transparent text-4xl font-medium text-foreground outline-none placeholder:text-muted-foreground leading-[40px]"
            />

            <div className="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Linked documents ({linkedPages.length})
              </p>

              {linkedPages.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-2 text-sm">
                  {linkedPages.map((linkedPage) => (
                    <Link
                      key={linkedPage.id}
                      href={`/wiki/${linkedPage.id}`}
                      className="rounded bg-card px-2 py-1 text-primary hover:underline"
                    >
                      {linkedPage.title}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mb-2 text-sm text-muted-foreground">
                  No outgoing links yet.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {allPages
                  .filter((candidate) => candidate.id !== pageId && !linkedPages.some((p) => p.id === candidate.id))
                  .slice(0, 8)
                  .map((candidate) => (
                    <Button
                      key={candidate.id}
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => insertWikiInlineLink(candidate.id, candidate.title)}
                    >
                      + {candidate.title}
                    </Button>
                  ))}
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Backlinks ({backlinks.length})
                </p>

                {backlinks.length > 0 ? (
                  <div className="flex flex-wrap gap-2 text-sm">
                    {backlinks.map((backlinkPage) => (
                      <Link
                        key={backlinkPage.id}
                        href={`/wiki/${backlinkPage.id}`}
                        className="rounded bg-card px-2 py-1 text-primary hover:underline"
                      >
                        {backlinkPage.title}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No incoming links yet.
                  </p>
                )}
              </div>
            </div>

            {/* BlockNote editor */}
            <BlockNoteView editor={editor} theme={resolvedTheme === "dark" ? "dark" : "light"} slashMenu={false} className="min-h-[400px]">
              <SuggestionMenuController
                triggerCharacter="/"
                floatingUIOptions={{
                  useFloatingOptions: {
                    placement: "bottom-start",
                    strategy: "fixed",
                    middleware: [],
                  },
                  elementProps: {
                    className: "wiki-slash-menu-popover",
                    style: { zIndex: 80, overflow: "hidden" },
                  },
                }}
                getItems={async (query) =>
                  filterSuggestionItems(getCustomSlashMenuItems(editor), query)
                }
              />
              <SuggestionMenuController
                triggerCharacter="[["
                floatingUIOptions={{
                  useFloatingOptions: {
                    strategy: "fixed",
                  },
                  elementProps: {
                    className: "wiki-inline-menu-popover",
                    style: { zIndex: 80, overflow: "hidden" },
                  },
                }}
                getItems={async (query) => {
                  return getWikiLinkItems(query)
                }}
              />
              <SuggestionMenuController
                triggerCharacter="#"
                floatingUIOptions={{
                  useFloatingOptions: {
                    strategy: "fixed",
                  },
                }}
                getItems={async (query) => getTagItems(query)}
              />
              <SuggestionMenuController
                triggerCharacter="{{"
                floatingUIOptions={{
                  useFloatingOptions: {
                    strategy: "fixed",
                  },
                  elementProps: {
                    className: "wiki-inline-menu-popover",
                    style: { zIndex: 80, overflow: "hidden" },
                  },
                }}
                getItems={async (query) => getMwsSnippetItems(query)}
              />
            </BlockNoteView>
          </div>
        </div>

        {/* Side panels */}
        {showComments && (
          <WikiCommentPanel pageId={pageId} onClose={() => setShowComments(false)} />
        )}
        {showHistory && (
          <WikiVersionPanel pageId={pageId} ydoc={ydoc} onClose={() => setShowHistory(false)} />
        )}

        {/* AI floating menu */}
        {showAi && (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <WikiAiFloatingMenu editor={editor as any} pageTitle={title} onClose={() => setShowAi(false)} />
        )}
        <WikiMwsSnippetConfigModal
          open={showSnippetConfig}
          initial={snippetDraftBinding}
          onClose={() => setShowSnippetConfig(false)}
          onApply={async (binding) => {
            insertInlineSnippet(binding)
            setSnippetDraftBinding(binding)
          }}
        />
        <WikiMwsAggregateSnippetConfigModal
          open={showAggregateSnippetConfig}
          initial={aggregationDraftBinding}
          onClose={() => setShowAggregateSnippetConfig(false)}
          onApply={async (binding) => {
            insertInlineAggregationSnippet(binding)
            setAggregationDraftBinding(binding)
          }}
        />
      </div>
    </div>
  )
}
