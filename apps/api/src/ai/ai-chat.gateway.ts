import { Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from "@nestjs/websockets"
import type { IncomingMessage } from "http"
import type { RawData, WebSocket } from "ws"
import { AiChatService } from "./ai-chat.service"
import { JwtVerifierService } from "../auth/jwt-verifier.service"

const WS_RATE_LIMIT = 30 // messages per window
const WS_RATE_WINDOW_MS = 60_000

type TaggedSocket = WebSocket & {
  __snippeterPing?: NodeJS.Timeout
  __msgCount?: number
  __msgWindowStart?: number
  __userSub?: string
}

@WebSocketGateway({ path: "/api/v1/ai-chat" })
export class AiChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(AiChatGateway.name)

  constructor(
    private readonly ai: AiChatService,
    private readonly config: ConfigService,
    private readonly jwtVerifier: JwtVerifierService,
  ) {}

  handleConnection(client: WebSocket, req: IncomingMessage): void {
    const corsOrigin = this.config.get<string>("CORS_ORIGIN")?.trim()
    if (corsOrigin) {
      const origin = req.headers.origin ?? ""
      const allowed = corsOrigin.split(",").map((s) => s.trim())
      if (!allowed.includes(origin)) {
        this.log.warn(`WS rejected: origin '${origin}' not in CORS_ORIGIN`)
        client.close(1008, "Origin not allowed")
        return
      }
    }

    // JWT auth: token from Sec-WebSocket-Protocol header (format: "bearer, <jwt>")
    // or access_token query param as fallback
    const token = this.extractWsToken(req)
    if (!token) {
      this.log.warn("WS rejected: missing auth token")
      client.close(4401, "Unauthorized")
      return
    }
    void this.jwtVerifier.verify(token).then((user) => {
      const sock = client as TaggedSocket
      sock.__userSub = user.sub
      sock.__msgCount = 0
      sock.__msgWindowStart = Date.now()
      this.ai.attachClient(sock)

      sock.on("message", (raw: RawData) => {
        void this.onClientMessage(sock, raw)
      })

      sock.__snippeterPing = setInterval(() => {
        if (sock.readyState === sock.OPEN) {
          sock.send(JSON.stringify({ type: "ping" }))
        }
      }, 30_000)
    }).catch(() => {
      this.log.warn("WS rejected: invalid token")
      client.close(4401, "Unauthorized")
    })
  }

  private extractWsToken(req: IncomingMessage): string | undefined {
    // Standard pattern: Sec-WebSocket-Protocol: bearer, <token>
    const proto = req.headers["sec-websocket-protocol"]
    if (proto) {
      const parts = (Array.isArray(proto) ? proto.join(",") : proto).split(",").map((s) => s.trim())
      const bearerPart = parts.find((p) => p.toLowerCase().startsWith("bearer.") || p.toLowerCase() === "bearer")
      if (bearerPart) {
        // format can be "bearer.<jwt>" or separate parts ["bearer", "<jwt>"]
        const idx = parts.indexOf(bearerPart)
        const token = bearerPart.toLowerCase().startsWith("bearer.") ? bearerPart.slice(7) : parts[idx + 1]
        if (token) return token
      }
      // Fallback: second segment is the token when first is "bearer"
      if (parts[0]?.toLowerCase() === "bearer" && parts[1]) return parts[1]
    }
    // Query param fallback (for EventSource / SSE compat)
    try {
      const url = new URL(req.url ?? "/", "http://localhost")
      const t = url.searchParams.get("access_token")
      if (t) return t
    } catch {
      // ignore
    }
    return undefined
  }

  handleDisconnect(client: WebSocket): void {
    const sock = client as TaggedSocket
    if (sock.__snippeterPing) {
      clearInterval(sock.__snippeterPing)
    }
    this.ai.detachClient(sock)
  }

  private async onClientMessage(client: TaggedSocket, raw: RawData): Promise<void> {
    try {
      const now = Date.now()
      if (now - (client.__msgWindowStart ?? 0) > WS_RATE_WINDOW_MS) {
        client.__msgCount = 0
        client.__msgWindowStart = now
      }
      client.__msgCount = (client.__msgCount ?? 0) + 1
      if (client.__msgCount > WS_RATE_LIMIT) {
        if (client.readyState === client.OPEN) {
          client.send(JSON.stringify({ type: "error", code: "RATE_LIMITED", message: "Too many messages. Please wait." }))
        }
        return
      }

      const text = typeof raw === "string" ? raw : raw.toString("utf8")
      const msg = JSON.parse(text) as { type?: string; text?: string }
      if (msg.type === "reset") {
        this.ai.resetSession(client)
        return
      }
      if (msg.type === "stop") {
        this.ai.stopGeneration(client)
        return
      }
      if (msg.type === "pong") {
        return
      }
      if (msg.type === "message" && typeof msg.text === "string") {
        await this.ai.handleUserMessage(client, msg.text)
        return
      }
      if (client.readyState === client.OPEN) {
        client.send(
          JSON.stringify({
            type: "error",
            code: "BAD_MESSAGE",
            message: "Expected {type:'message',text}, {type:'reset'}, {type:'stop'}, or {type:'pong'}",
          }),
        )
      }
    } catch (e) {
      this.log.warn(`WS message error: ${String(e)}`)
      if (client.readyState === client.OPEN) {
        client.send(
          JSON.stringify({ type: "error", code: "PARSE_ERROR", message: "Invalid JSON" }),
        )
      }
    }
  }
}
