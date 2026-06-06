import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { flushLangfuseSpanProcessor, getLangfuseOtelSdk } from "../instrumentation"

@Injectable()
export class AiLangfuseService {
  private readonly log = new Logger(AiLangfuseService.name)
  private readonly keysPresent: boolean

  constructor(private readonly config: ConfigService) {
    const pub = this.config.get<string>("LANGFUSE_PUBLIC_KEY")?.trim()
    const sec = this.config.get<string>("LANGFUSE_SECRET_KEY")?.trim()
    this.keysPresent = Boolean(pub && sec)
    if (this.keysPresent) {
      this.log.log("Langfuse tracing enabled (OpenTelemetry exporter)")
    }
  }

  get enabled(): boolean {
    return this.keysPresent && getLangfuseOtelSdk() != null
  }

  async forceFlush(): Promise<void> {
    if (!this.keysPresent) return
    try {
      await flushLangfuseSpanProcessor()
    } catch (e) {
      this.log.warn(`Langfuse forceFlush: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
