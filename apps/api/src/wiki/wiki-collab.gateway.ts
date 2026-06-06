import { randomBytes } from "node:crypto"
import { Inject, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from "@nestjs/websockets"
import type { IncomingMessage } from "node:http"
import { URL } from "node:url"
import * as Y from "yjs"
import * as syncProtocol from "y-protocols/sync"
import * as awarenessProtocol from "y-protocols/awareness"
import * as encoding from "lib0/encoding"
import * as decoding from "lib0/decoding"
import type Redis from "ioredis"
import type { RawData, WebSocket } from "ws"
import { WikiPagesRepository } from "./wiki-pages.repository"
import { WikiRelationsService } from "./wiki-relations.service"
import { JwtVerifierService } from "../auth/jwt-verifier.service"

const MSG_SYNC = 0
const MSG_AWARENESS = 1

const WS_RATE_LIMIT = 100
const WS_RATE_WINDOW_MS = 60_000
const PERSIST_DEBOUNCE_MS = 2_000
const ROOM_IDLE_CLEANUP_MS = 60_000

/** Avoid double-applying awareness when this process both publishes and subscribes via duplicate Redis connections. */
const WIKI_COLLAB_REDIS_INSTANCE = randomBytes(12).toString("hex")

const REDIS_AWARENESS_ORIGIN = Object.freeze({ __wikiCollabRedisAwareness: true })

type TaggedSocket = WebSocket & {
  __wikiMsgCount?: number
  __wikiMsgWindowStart?: number
  __wikiPageId?: string
  __userSub?: string
  __awarenessClientIds?: Set<number>
}

interface WikiRoom {
  doc: Y.Doc
  awareness: awarenessProtocol.Awareness
  clients: Set<TaggedSocket>
  persistTimer: NodeJS.Timeout | null
  idleTimer: NodeJS.Timeout | null
  /** Unsubscribe when room is flushed (best-effort; avoids duplicate handlers on respawn). */
  awarenessUpdateOff?: () => void
}

@WebSocketGateway({ path: "/api/v1/wiki-collab" })
export class WikiCollabGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(WikiCollabGateway.name)
  private readonly rooms = new Map<string, WikiRoom>()
  private redisSub: Redis | null = null

  constructor(
    private readonly pagesRepo: WikiPagesRepository,
    private readonly relations: WikiRelationsService,
    private readonly config: ConfigService,
    private readonly jwtVerifier: JwtVerifierService,
    @Inject("REDIS") private readonly redis: Redis,
  ) {}

  async handleConnection(client: TaggedSocket, req: IncomingMessage): Promise<void> {
    // CORS check (same pattern as AiChatGateway)
    const corsOrigin = this.config.get<string>("CORS_ORIGIN")?.trim()
    if (corsOrigin) {
      const origin = req.headers.origin ?? ""
      const allowed = corsOrigin.split(",").map((s) => s.trim())
      if (!allowed.includes(origin)) {
        this.log.warn(`WikiCollab WS rejected: origin '${origin}'`)
        client.close(1008, "Origin not allowed")
        return
      }
    }

    // JWT auth
    const token = this.extractWsToken(req)
    if (!token) {
      this.log.warn("WikiCollab WS rejected: missing auth token")
      client.close(4401, "Unauthorized")
      return
    }
    try {
      const user = await this.jwtVerifier.verify(token)
      client.__userSub = user.sub
    } catch {
      this.log.warn("WikiCollab WS rejected: invalid token")
      client.close(4401, "Unauthorized")
      return
    }

    // Parse pageId from URL query
    let pageId: string | null = null
    try {
      const fullUrl = req.url ?? "/"
      // Try to parse the URL
      const url = new URL(fullUrl, "http://localhost")
      pageId = url.searchParams.get("pageId")

      // If pageId not in query, try from path (format: /api/v1/wiki-collab?pageId=xxx or /api/v1/wiki-collab/{pageId})
      if (!pageId && fullUrl.includes("/wiki-collab/")) {
        const match = fullUrl.match(/\/wiki-collab\/([^/?]+)/)
        if (match && match[1]) {
          pageId = match[1]
        }
      }
    } catch (e) {
      this.log.warn(`Failed to parse URL from request: ${String(e)}`)
    }
    if (!pageId) {
      client.close(1008, "pageId required")
      return
    }

    client.__wikiPageId = pageId
    client.__wikiMsgCount = 0
    client.__wikiMsgWindowStart = Date.now()

    const room = await this.getOrCreateRoom(pageId)
    room.clients.add(client)

    // Cancel idle cleanup timer if room had one
    if (room.idleTimer) {
      clearTimeout(room.idleTimer)
      room.idleTimer = null
    }

    // Send initial sync step 1 to the new client
    const syncMsg = encoding.createEncoder()
    encoding.writeVarUint(syncMsg, MSG_SYNC)
    syncProtocol.writeSyncStep1(syncMsg, room.doc)
    client.send(encoding.toUint8Array(syncMsg))

    // Send current awareness state
    const awarenessStates = room.awareness.getStates()
    if (awarenessStates.size > 0) {
      const awarenessMsg = encoding.createEncoder()
      encoding.writeVarUint(awarenessMsg, MSG_AWARENESS)
      encoding.writeVarUint8Array(
        awarenessMsg,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...awarenessStates.keys()]),
      )
      client.send(encoding.toUint8Array(awarenessMsg))
    }

    client.on("message", (raw: RawData) => {
      void this.onClientMessage(client, raw, room)
    })
  }

  handleDisconnect(client: TaggedSocket): void {
    const pageId = client.__wikiPageId
    if (!pageId) return
    const room = this.rooms.get(pageId)
    if (!room) return

    room.clients.delete(client)
    const peerIds = client.__awarenessClientIds
    if (peerIds && peerIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(room.awareness, [...peerIds], null)
    }

    if (room.clients.size === 0) {
      // Schedule cleanup after idle period
      room.idleTimer = setTimeout(() => {
        this.flushAndCloseRoom(pageId, room)
      }, ROOM_IDLE_CLEANUP_MS)
    }
  }

  private async getOrCreateRoom(pageId: string): Promise<WikiRoom> {
    const existing = this.rooms.get(pageId)
    if (existing) return existing

    const doc = new Y.Doc()
    const awareness = new awarenessProtocol.Awareness(doc)

    // Load persisted snapshot; create an empty one if missing (e.g. pages created before this feature)
    try {
      const snapshot = await this.pagesRepo.loadSnapshot(pageId)
      if (snapshot) {
        Y.applyUpdate(doc, snapshot)
      } else {
        const emptyState = Buffer.from(Y.encodeStateAsUpdate(doc))
        await this.pagesRepo.saveSnapshot(pageId, emptyState)
      }
    } catch (e) {
      this.log.warn(`Failed to load/init snapshot for page ${pageId}: ${String(e)}`)
    }

    const room: WikiRoom = { doc, awareness, clients: new Set(), persistTimer: null, idleTimer: null }
    this.rooms.set(pageId, room)

    const onAwarenessMeta = (
      { added, updated }: { added: number[]; updated: number[] },
      origin: unknown,
    ): void => {
      if (origin === REDIS_AWARENESS_ORIGIN) return
      const sock = origin as TaggedSocket | undefined
      if (!sock || typeof sock.send !== "function") return
      if (!sock.__awarenessClientIds) sock.__awarenessClientIds = new Set()
      for (const id of added) sock.__awarenessClientIds.add(id)
      for (const id of updated) sock.__awarenessClientIds.add(id)
    }
    awareness.on("update", onAwarenessMeta)
    room.awarenessUpdateOff = () => {
      awareness.off("update", onAwarenessMeta)
    }

    doc.on("update", (update: Uint8Array) => {
      // Publish update to Redis for cross-instance broadcasting (send Buffer, not string, to avoid UTF-8 corruption)
      const channelPrefix = this.config.get<string>("WIKI_COLLAB_REDIS_CHANNEL_PREFIX") ?? "snippeter:wiki:collab:"
      void this.redis.publish(channelPrefix + pageId, Buffer.from(update))
      this.schedulePersist(pageId, room)
    })

    // Subscribe to Redis pub-sub for multi-instance sync
    void this.ensureRedisSub(pageId, doc)
    void this.ensureRedisAwarenessSub(pageId, room)

    return room
  }

  private awarenessChannel(pageId: string): string {
    const channelPrefix = this.config.get<string>("WIKI_COLLAB_REDIS_CHANNEL_PREFIX") ?? "snippeter:wiki:collab:"
    return `${channelPrefix}${pageId}:awareness`
  }

  private packRedisAwarenessPayload(awarenessUpdate: Uint8Array): Buffer {
    const idBuf = Buffer.from(`${WIKI_COLLAB_REDIS_INSTANCE}|`, "utf8")
    return Buffer.concat([idBuf, Buffer.from(awarenessUpdate)])
  }

  private unpackRedisAwarenessMessage(msg: Buffer): { skip: boolean; update: Uint8Array } | null {
    const sep = msg.indexOf("|")
    if (sep <= 0) return { skip: false, update: new Uint8Array(msg) }
    const sender = msg.subarray(0, sep).toString("utf8")
    if (sender === WIKI_COLLAB_REDIS_INSTANCE) return { skip: true, update: new Uint8Array(0) }
    return { skip: false, update: new Uint8Array(msg.buffer, msg.byteOffset + sep + 1, msg.byteLength - sep - 1) }
  }

  private async ensureRedisAwarenessSub(pageId: string, room: WikiRoom): Promise<void> {
    try {
      if (!this.redisSub) {
        this.redisSub = this.redis.duplicate()
      }
      const channel = this.awarenessChannel(pageId)
      await this.redisSub.subscribe(channel)
      this.redisSub.on("messageBuffer", (chan: Buffer, msg: Buffer) => {
        if (chan.toString() !== channel) return
        const unpacked = this.unpackRedisAwarenessMessage(msg)
        if (!unpacked || unpacked.skip) return
        const { update } = unpacked
        try {
          awarenessProtocol.applyAwarenessUpdate(room.awareness, update, REDIS_AWARENESS_ORIGIN)
        } catch (applyErr) {
          this.log.warn(`Redis: failed to apply awareness for page ${pageId}: ${String(applyErr)}`)
          return
        }
        const awarenessMsg = encoding.createEncoder()
        encoding.writeVarUint(awarenessMsg, MSG_AWARENESS)
        encoding.writeVarUint8Array(awarenessMsg, update)
        const out = encoding.toUint8Array(awarenessMsg)
        for (const c of room.clients) {
          if (c.readyState === c.OPEN) {
            c.send(out)
          }
        }
      })
    } catch (e) {
      this.log.warn(`Redis awareness sub error for page ${pageId}: ${String(e)}`)
    }
  }

  private async ensureRedisSub(pageId: string, doc: Y.Doc): Promise<void> {
    try {
      if (!this.redisSub) {
        this.redisSub = this.redis.duplicate()
      }
      const channelPrefix = this.config.get<string>("WIKI_COLLAB_REDIS_CHANNEL_PREFIX") ?? "snippeter:wiki:collab:"
      const channel = channelPrefix + pageId
      await this.redisSub.subscribe(channel)
      this.redisSub.on("messageBuffer", (chan: Buffer, msg: Buffer) => {
        if (chan.toString() !== channel) return
        const update = new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength)
        try {
          Y.applyUpdate(doc, update)
        } catch (applyErr) {
          this.log.warn(`Redis: failed to apply Y.js update for page ${pageId}: ${String(applyErr)}`)
          return
        }
        // Broadcast to local clients
        const room = this.rooms.get(pageId)
        if (room) {
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, MSG_SYNC)
          syncProtocol.writeUpdate(encoder, update)
          const message = encoding.toUint8Array(encoder)
          for (const client of room.clients) {
            if (client.readyState === client.OPEN) {
              client.send(message)
            }
          }
        }
      })
    } catch (e) {
      this.log.warn(`Redis sub error for page ${pageId}: ${String(e)}`)
    }
  }

  private async onClientMessage(client: TaggedSocket, raw: RawData, room: WikiRoom): Promise<void> {
    // Rate limiting
    const now = Date.now()
    if (now - (client.__wikiMsgWindowStart ?? 0) > WS_RATE_WINDOW_MS) {
      client.__wikiMsgCount = 0
      client.__wikiMsgWindowStart = now
    }
    client.__wikiMsgCount = (client.__wikiMsgCount ?? 0) + 1
    if (client.__wikiMsgCount > WS_RATE_LIMIT) return

    try {
      const data = Buffer.isBuffer(raw)
        ? raw
        : ArrayBuffer.isView(raw)
          ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
          : Buffer.from(raw as ArrayBuffer)

      const uint8 = new Uint8Array(data)
      const decoder = decoding.createDecoder(uint8)
      const msgType = decoding.readVarUint(decoder)

      if (msgType === MSG_SYNC) {
        const replyEncoder = encoding.createEncoder()
        encoding.writeVarUint(replyEncoder, MSG_SYNC)
        syncProtocol.readSyncMessage(decoder, replyEncoder, room.doc, client)
        // y-protocols writes to encoder only when a reply is required.
        // Sending a bare MSG_SYNC byte breaks client decoding.
        if (encoding.length(replyEncoder) > 1) {
          client.send(encoding.toUint8Array(replyEncoder))
        }
      } else if (msgType === MSG_AWARENESS) {
        const awarenessUpdate = decoding.readVarUint8Array(decoder)
        const pageId = client.__wikiPageId
        awarenessProtocol.applyAwarenessUpdate(room.awareness, awarenessUpdate, client)
        // Broadcast awareness to all other clients on this instance
        const awarenessMsg = encoding.createEncoder()
        encoding.writeVarUint(awarenessMsg, MSG_AWARENESS)
        encoding.writeVarUint8Array(awarenessMsg, awarenessUpdate)
        const msg = encoding.toUint8Array(awarenessMsg)
        for (const other of room.clients) {
          if (other !== client && other.readyState === other.OPEN) {
            other.send(msg)
          }
        }
        // Other API instances (Redis subscriber skips same-instance payloads via unpack)
        if (pageId) {
          void this.redis.publish(this.awarenessChannel(pageId), this.packRedisAwarenessPayload(awarenessUpdate))
        }
      }
    } catch (e) {
      this.log.warn(`WikiCollab message error for page ${client.__wikiPageId}: ${String(e)}`)
    }
  }

  private schedulePersist(pageId: string, room: WikiRoom): void {
    if (room.persistTimer) clearTimeout(room.persistTimer)
    const debounceMs = this.config.get<number>("WIKI_SNAPSHOT_DEBOUNCE_MS") ?? PERSIST_DEBOUNCE_MS
    room.persistTimer = setTimeout(() => {
      void this.persistRoom(pageId, room)
    }, debounceMs)
  }

  private async persistRoom(pageId: string, room: WikiRoom): Promise<void> {
    try {
      const state = Buffer.from(Y.encodeStateAsUpdate(room.doc))
      await this.pagesRepo.saveSnapshot(pageId, state)
      await this.relations.reindexPageFromSnapshot(pageId, state)
    } catch (e) {
      this.log.warn(`Failed to persist snapshot for page ${pageId}: ${String(e)}`)
    }
  }

  private async flushAndCloseRoom(pageId: string, room: WikiRoom): Promise<void> {
    await this.persistRoom(pageId, room)
    if (room.persistTimer) clearTimeout(room.persistTimer)
    if (room.idleTimer) clearTimeout(room.idleTimer)
    room.awarenessUpdateOff?.()
    room.awarenessUpdateOff = undefined
    this.rooms.delete(pageId)
    this.log.log(`Room closed and flushed: page ${pageId}`)
  }

  private extractWsToken(req: IncomingMessage): string | undefined {
    const proto = req.headers["sec-websocket-protocol"]
    if (proto) {
      const parts = (Array.isArray(proto) ? proto.join(",") : proto).split(",").map((s) => s.trim())
      if (parts[0]?.toLowerCase() === "bearer" && parts[1]) return parts[1]
    }
    try {
      const url = new URL(req.url ?? "/", "http://localhost")
      const t = url.searchParams.get("access_token")
      if (t) return t
    } catch {
      // ignore
    }
    return undefined
  }
}
