import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import type { Response } from "express"

const SYSTEM_PROMPT = `You are a helpful wiki editor assistant for a BlockNote-style wiki.

When the user sends the current page (markdown) and a request, generate content that matches the page's tone, terminology, and structure.

Respond only with markdown the editor can import: use # and ## (and ### if needed) for headings, - or * for bullet lists, 1. for numbered lists, \`\`\` for fenced code blocks when appropriate, and normal paragraphs otherwise.

Stay concise and directly address the user request. Do not wrap the answer in a markdown code fence unless the user asked for a code sample.`

@Injectable()
export class WikiAiService {
  private readonly log = new Logger(WikiAiService.name)
  private anthropicClient: Anthropic | null = null
  private openaiClient: OpenAI | null = null

  constructor(private readonly config: ConfigService) {}

  private provider(): "anthropic" | "openai" {
    const p = this.config.get<string>("LLM_PROVIDER")?.trim().toLowerCase() ?? "anthropic"
    return p === "openai" ? "openai" : "anthropic"
  }

  private getAnthropicClient(): Anthropic {
    if (!this.anthropicClient) {
      const apiKey = this.config.getOrThrow<string>("LLM_API_KEY")
      this.anthropicClient = new Anthropic({ apiKey })
    }
    return this.anthropicClient
  }

  private getOpenaiClient(): OpenAI {
    if (!this.openaiClient) {
      const apiKey = this.config.getOrThrow<string>("LLM_API_KEY")
      const baseURL = this.config.get<string>("LLM_BASE_URL")?.trim() || undefined
      this.openaiClient = new OpenAI({ apiKey, ...(baseURL && { baseURL }) })
    }
    return this.openaiClient
  }

  private defaultModel(): string {
    return (
      this.config.get<string>("LLM_MODEL")?.trim() ??
      (this.provider() === "openai" ? "gpt-4o" : "claude-sonnet-4-6")
    )
  }

  async streamSuggestion(prompt: string, context: string, res: Response): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    const sendEvent = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    try {
      const model = this.defaultModel()
      const userMessage = context.trim()
        ? `${context.trim()}\n\n---\nUser request:\n${prompt}`
        : prompt

      if (this.provider() === "openai") {
        const client = this.getOpenaiClient()
        const stream = await client.chat.completions.create({
          model,
          max_tokens: 2048,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          stream: true,
        })
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) sendEvent({ type: "token", text: delta })
        }
      } else {
        const client = this.getAnthropicClient()
        const stream = client.messages.stream({
          model,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        })
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            sendEvent({ type: "token", text: event.delta.text })
          }
        }
      }

      sendEvent({ type: "done" })
    } catch (e) {
      this.log.warn(`Wiki AI suggest error: ${String(e)}`)
      sendEvent({ type: "error", message: String(e) })
    } finally {
      res.end()
    }
  }

  async summarizePage(textContent: string): Promise<string> {
    const model = this.defaultModel()
    const system = "Summarize the following wiki page content in 3-5 bullet points. Return only markdown."
    const user = textContent.slice(0, 8000)

    if (this.provider() === "openai") {
      const client = this.getOpenaiClient()
      const completion = await client.chat.completions.create({
        model,
        max_tokens: 512,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      })
      return completion.choices[0]?.message?.content ?? ""
    }

    const client = this.getAnthropicClient()
    const message = await client.messages.create({
      model,
      max_tokens: 512,
      system,
      messages: [{ role: "user", content: user }],
    })
    const block = message.content[0]
    return block?.type === "text" ? block.text : ""
  }
}
