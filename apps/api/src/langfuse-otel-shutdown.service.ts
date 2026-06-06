import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common"
import { shutdownLangfuseOtelSdk } from "./instrumentation"

@Injectable()
export class LangfuseOtelShutdownService implements OnApplicationShutdown {
  private readonly log = new Logger(LangfuseOtelShutdownService.name)

  async onApplicationShutdown(): Promise<void> {
    await shutdownLangfuseOtelSdk()
    this.log.log("Langfuse OpenTelemetry SDK shut down")
  }
}
