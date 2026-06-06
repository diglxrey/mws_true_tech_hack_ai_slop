import { randomUUID } from "crypto"
import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import {
  LangfuseOtelSpanAttributes,
  propagateAttributes,
  startActiveObservation,
  type LangfuseGeneration,
  type LangfuseSpan,
} from "@langfuse/tracing"
import type { WebSocket } from "ws"
import { runPromptGuard } from "./ai-prompt-guard"
import { OUTPUT_VALIDATION_FALLBACK, validateAssistantOutput } from "./ai-output-validation"
import { AiLangfuseService } from "./ai-langfuse.service"
import { AiSystemPromptService } from "./ai-system-prompt.service"

const LF_PREVIEW_LEN = 120

type Provider = "anthropic" | "openai"

interface SessionState {
  historyAnthropic: Anthropic.MessageParam[]
  historyOpenai: OpenAI.Chat.ChatCompletionMessageParam[]
  abort: AbortController | null
  langfuseSessionId: string
}

type LfTurnCtx = { root: LangfuseSpan; tags: string[] }

function safeSend(ws: WebSocket, obj: object): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj))
  }
}

function applyTraceTags(root: LangfuseSpan, tags: string[]): void {
  if (tags.length === 0) return
  root.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_TAGS, tags)
}

function truncateStrLf(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

function truncateJsonLf(value: unknown, max: number): unknown {
  if (value === null || typeof value !== "object") {
    const str = String(value)
    return str.length <= max ? value : `${str.slice(0, max)}…`
  }
  try {
    const s = JSON.stringify(value)
    if (s.length <= max) return value
    return { truncated: true, preview: `${s.slice(0, max)}…` }
  } catch {
    return "[unserializable]"
  }
}

function summarizeAnthropicMessagesForLf(messages: Anthropic.MessageParam[]): unknown[] {
  return messages.map((m) => ({
    role: m.role,
    content: anthropicContentPreview(m.content),
  }))
}

function anthropicContentPreview(content: Anthropic.MessageParam["content"]): unknown {
  if (typeof content === "string") return truncateStrLf(content, LF_PREVIEW_LEN)
  if (!Array.isArray(content)) return content
  return content.map((block) => {
    if (block.type === "text") return { type: "text", text: truncateStrLf(block.text, LF_PREVIEW_LEN) }
    if (block.type === "tool_use") {
      return {
        type: "tool_use",
        name: block.name,
        id: block.id,
        input: truncateJsonLf(block.input, 800),
      }
    }
    if (block.type === "tool_result") {
      return {
        type: "tool_result",
        tool_use_id: block.tool_use_id,
        content: truncateStrLf(
          typeof block.content === "string" ? block.content : JSON.stringify(block.content),
          LF_PREVIEW_LEN,
        ),
      }
    }
    return { type: block.type }
  })
}

function summarizeOpenaiMessagesForLf(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): unknown[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const role = m.role
      if (role === "user") {
        const c = m.content
        return {
          role,
          content: typeof c === "string" ? truncateStrLf(c, LF_PREVIEW_LEN) : c,
        }
      }
      if (role === "assistant") {
        return {
          role,
          content:
            typeof m.content === "string"
              ? truncateStrLf(m.content, LF_PREVIEW_LEN)
              : m.content ?? null,
          tool_calls: m.tool_calls?.map((tc) => ({
            id: tc.id,
            name: tc.function?.name,
            arguments_preview: truncateStrLf(tc.function?.arguments ?? "", 400),
          })),
        }
      }
      if (role === "tool") {
        const c = m.content
        return {
          role,
          tool_call_id: m.tool_call_id,
          content: typeof c === "string" ? truncateStrLf(c, LF_PREVIEW_LEN) : c,
        }
      }
      return { role }
    })
}

function assistantPreviewAnthropicMessage(final: Anthropic.Message): string {
  const textParts = final.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
  return truncateStrLf(textParts.join(""), 500)
}

@Injectable()
export class AiChatService {
  private readonly log = new Logger(AiChatService.name)
  private readonly sessions = new Map<WebSocket, SessionState>()
  private anthropicClient: Anthropic | null = null
  private openaiClient: OpenAI | null = null

  constructor(
    private readonly config: ConfigService,
    private readonly systemPrompt: AiSystemPromptService,
    private readonly langfuse: AiLangfuseService,
  ) {}

  private getAnthropicClient(): Anthropic {
    const apiKey = this.config.get<string>("LLM_API_KEY")!.trim()
    if (!this.anthropicClient) {
      this.anthropicClient = new Anthropic({ apiKey })
    }
    return this.anthropicClient
  }

  private getOpenaiClient(): OpenAI {
    const apiKey = this.config.get<string>("LLM_API_KEY")!.trim()
    const baseURL = this.config.get<string>("LLM_BASE_URL")?.trim() || undefined
    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({ apiKey, ...(baseURL && { baseURL }) })
    }
    return this.openaiClient
  }

  attachClient(ws: WebSocket): void {
    this.sessions.set(ws, {
      historyAnthropic: [],
      historyOpenai: [],
      abort: null,
      langfuseSessionId: randomUUID(),
    })
  }

  detachClient(ws: WebSocket): void {
    const s = this.sessions.get(ws)
    if (s?.abort) {
      s.abort.abort()
    }
    this.sessions.delete(ws)
  }

  resetSession(ws: WebSocket): void {
    const s = this.sessions.get(ws)
    if (!s) return
    if (s.abort) s.abort.abort()
    s.historyAnthropic = []
    s.historyOpenai = []
    s.abort = null
    s.langfuseSessionId = randomUUID()
  }

  stopGeneration(ws: WebSocket): void {
    const s = this.sessions.get(ws)
    s?.abort?.abort()
  }

  private isAiConfigured(): boolean {
    return Boolean(this.config.get<string>("LLM_API_KEY")?.trim())
  }

  private provider(): Provider {
    const p = (this.config.get<string>("LLM_PROVIDER")?.trim().toLowerCase() ?? "anthropic") as Provider
    return p === "openai" ? "openai" : "anthropic"
  }

  private maxHistory(): number {
    const n = Number.parseInt(this.config.get<string>("MAX_HISTORY_MESSAGES") ?? "50", 10)
    return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 50
  }

  private maxInputLen(): number {
    const n = Number.parseInt(this.config.get<string>("MAX_INPUT_LENGTH") ?? "4000", 10)
    return Number.isFinite(n) && n > 0 ? Math.min(n, 32_000) : 4000
  }

  private injectionEnabled(): boolean {
    const v = this.config.get<string>("INJECTION_FILTER_ENABLED")?.trim().toLowerCase()
    return v !== "false"
  }

  async handleUserMessage(ws: WebSocket, text: string): Promise<void> {
    if (!this.isAiConfigured()) {
      safeSend(ws, {
        type: "error",
        code: "AI_NOT_CONFIGURED",
        message: "Set LLM_API_KEY (and optionally LLM_PROVIDER, LLM_MODEL, LLM_BASE_URL) for AI chat.",
      })
      return
    }

    const session = this.sessions.get(ws)
    if (!session) return

    if (!this.langfuse.enabled) {
      await this.runUserMessageTurn(ws, text, session, undefined)
      return
    }

    await startActiveObservation("ai_chat_turn", async (rootSpan: LangfuseSpan) => {
      rootSpan.update({
        input: {
          user_message_preview: text.slice(0, LF_PREVIEW_LEN),
          timestamp: new Date().toISOString(),
        },
      })
      const lf: LfTurnCtx = { root: rootSpan, tags: [] }
      await propagateAttributes({ sessionId: session.langfuseSessionId }, async () => {
        await this.runUserMessageTurn(ws, text, session, lf)
      })
    })
  }

  private async runUserMessageTurn(
    ws: WebSocket,
    text: string,
    session: SessionState,
    lf: LfTurnCtx | undefined,
  ): Promise<void> {
    const t0 = Date.now()
    const addTag = (tag: string) => {
      if (lf && !lf.tags.includes(tag)) lf.tags.push(tag)
    }

    const guardT0 = Date.now()
    const guard = runPromptGuard(text, {
      enabled: this.injectionEnabled(),
      maxLength: this.maxInputLen(),
    })

    if (lf) {
      const gs = lf.root.startObservation("prompt_guard", {
        input: { length: text.length, preview: text.slice(0, LF_PREVIEW_LEN) },
      })
      gs.update({
        output: { passed: guard.passed, pattern: guard.pattern },
        metadata: { duration_ms: Date.now() - guardT0 },
      })
      gs.end()
    }

    if (!guard.passed) {
      addTag("injection_attempt")
      if (lf) {
        applyTraceTags(lf.root, lf.tags)
        lf.root.update({ metadata: { filter_pattern: guard.pattern ?? "unknown" } })
        await this.langfuse.forceFlush()
      }
      safeSend(ws, {
        type: "warning",
        code: "PROMPT_INJECTION_DETECTED",
        message: "This message was blocked by the safety filter.",
      })
      return
    }

    const userContent = guard.sanitized ?? text
    session.historyAnthropic.push({ role: "user", content: userContent })
    session.historyOpenai.push({ role: "user", content: userContent })
    this.trimHistory(session)

    session.abort = new AbortController()
    const signal = session.abort.signal
    const llmTimeoutMs = 60_000
    const timeout = setTimeout(() => session.abort?.abort(), llmTimeoutMs)

    let finalText = ""
    try {
      const provider = this.provider()
      const model =
        this.config.get<string>("LLM_MODEL")?.trim() ??
        (provider === "openai" ? "gpt-4o" : "claude-3-5-sonnet-20241022")

      if (provider === "anthropic") {
        finalText = await this.runAnthropicTurn(ws, model, signal, session, lf, addTag)
      } else {
        finalText = await this.runOpenaiTurn(ws, model, signal, session, lf)
      }

      const outT0 = Date.now()
      const outCheck = validateAssistantOutput(finalText)
      if (lf) {
        const vs = lf.root.startObservation("output_validation", {
          input: { assistant_preview: finalText.slice(0, 200) },
        })
        vs.update({
          output: { passed: outCheck.passed },
          metadata: { duration_ms: Date.now() - outT0 },
        })
        vs.end()
      }

      if (!outCheck.passed) {
        addTag("injection_attempt")
        addTag("fallback_used")
        finalText = OUTPUT_VALIDATION_FALLBACK
      }

      if (lf) {
        applyTraceTags(lf.root, lf.tags)
        lf.root.update({
          metadata: {
            duration_ms_total: Date.now() - t0,
            system_prompt_sha256: this.systemPrompt.getPromptHash(),
            assistant_preview: finalText.slice(0, 500),
          },
        })
      }

      session.historyAnthropic.push({ role: "assistant", content: finalText })
      session.historyOpenai.push({ role: "assistant", content: finalText })
      this.trimHistory(session)

      safeSend(ws, { type: "done", text: finalText })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes("validation")) {
        safeSend(ws, { type: "error", code: "INVALID_PARAMS", message: msg })
      } else if (signal.aborted) {
        safeSend(ws, { type: "error", code: "ABORTED", message: "Generation stopped." })
      } else {
        this.log.error(msg, e)
        safeSend(ws, { type: "error", code: "LLM_ERROR", message: msg })
      }
    } finally {
      clearTimeout(timeout)
      session.abort = null
      if (lf) {
        applyTraceTags(lf.root, lf.tags)
      }
      await this.langfuse.forceFlush()
    }
  }

  private trimHistory(session: SessionState): void {
    const max = this.maxHistory()
    while (session.historyAnthropic.length > max) {
      session.historyAnthropic.shift()
    }
    while (session.historyOpenai.length > max) {
      session.historyOpenai.shift()
    }
  }

  private async runAnthropicTurn(
    ws: WebSocket,
    model: string,
    signal: AbortSignal,
    session: SessionState,
    lf: LfTurnCtx | undefined,
    addTag: (t: string) => void,
  ): Promise<string> {
    const client = this.getAnthropicClient()
    const system = this.systemPrompt.getPrompt()
    let lastText = ""

    if (signal.aborted) throw new Error("aborted")

    let gen: LangfuseGeneration | undefined
    if (lf) {
      gen = lf.root.startObservation(
        "llm_call",
        {
          model,
          input: {
            round: 0,
            messages: summarizeAnthropicMessagesForLf(session.historyAnthropic),
          },
        },
        { asType: "generation" },
      )
    }

    const stream = client.messages.stream(
      {
        model,
        max_tokens: 8192,
        system,
        messages: session.historyAnthropic,
      },
      { signal },
    )

    for await (const ev of stream) {
      if (signal.aborted) break
      if (ev.type === "content_block_delta") {
        const d = ev.delta
        if (d.type === "text_delta" && d.text) {
          lastText += d.text
          safeSend(ws, { type: "token", text: d.text })
        }
      }
    }

    const final = await stream.finalMessage()

    if (final.stop_reason === "tool_use") {
      this.log.warn("Anthropic returned tool_use without registered tools; using text only if present.")
      addTag("unexpected_tool_use")
    }

    if (lf && gen) {
      const preview = assistantPreviewAnthropicMessage(final)
      const u = final.usage
      gen.update({
        output: { preview, stop_reason: final.stop_reason },
        usageDetails: u
          ? {
              input: u.input_tokens,
              output: u.output_tokens,
              total: u.input_tokens + u.output_tokens,
            }
          : undefined,
      })
      gen.end()
    }

    const textParts = final.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
    return textParts.join("") || lastText
  }

  private async runOpenaiTurn(
    ws: WebSocket,
    model: string,
    signal: AbortSignal,
    session: SessionState,
    lf: LfTurnCtx | undefined,
  ): Promise<string> {
    const client = this.getOpenaiClient()
    const system = this.systemPrompt.getPrompt()
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      ...session.historyOpenai,
    ]

    if (signal.aborted) throw new Error("aborted")

    let gen: LangfuseGeneration | undefined
    if (lf) {
      gen = lf.root.startObservation(
        "llm_call",
        {
          model,
          input: {
            round: 0,
            messages: summarizeOpenaiMessagesForLf(messages),
          },
        },
        { asType: "generation" },
      )
    }

    const stream = await client.chat.completions.create(
      {
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      } as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
      { signal },
    )

    let assistantText = ""
    let streamUsage: OpenAI.CompletionUsage | undefined

    for await (const part of stream) {
      const choice = part.choices[0]
      const delta = choice?.delta
      if (delta?.content) {
        assistantText += delta.content
        safeSend(ws, { type: "token", text: delta.content })
      }
      if (part.usage) {
        streamUsage = part.usage
      }
    }

    if (lf && gen) {
      gen.update({
        output: { preview: truncateStrLf(assistantText, 500) },
        usageDetails: streamUsage
          ? {
              input: streamUsage.prompt_tokens,
              output: streamUsage.completion_tokens,
              total: streamUsage.total_tokens,
            }
          : undefined,
      })
      gen.end()
    }

    return assistantText
  }
}
