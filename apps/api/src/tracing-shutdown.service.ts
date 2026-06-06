import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common"
import { shutdownLangfuseOtelSdk } from "./instrumentation"

@Injectable()
export class TracingShutdownService implements OnApplicationShutdown {
  private readonly log = new Logger(TracingShutdownService.name)

  async onApplicationShutdown(): Promise<void> {
    try {
      await shutdownLangfuseOtelSdk()
    } catch (e) {
      this.log.warn(`OpenTelemetry shutdown: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
