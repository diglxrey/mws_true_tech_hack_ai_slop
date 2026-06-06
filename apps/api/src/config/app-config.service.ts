import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  publicBaseUrl(): string {
    const explicit = this.config.get<string>("PUBLIC_BASE_URL")?.replace(/\/$/, "")
    if (explicit) {
      return explicit
    }
    const port = this.config.get<string>("PORT") ?? "3001"
    return `http://127.0.0.1:${port}`
  }
}
