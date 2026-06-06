import type { INestApplication, LogLevel } from "@nestjs/common"
import { Logger } from "@nestjs/common"
import type { NextFunction, Request, Response } from "express"

const LEVEL_ORDER: LogLevel[] = ["error", "warn", "log", "debug", "verbose"]

export function resolveNestLogLevels(): LogLevel[] {
  const explicit = process.env["LOG_LEVEL"]?.trim().toLowerCase()
  if (explicit) {
    const idx = LEVEL_ORDER.indexOf(explicit as LogLevel)
    if (idx >= 0) {
      return LEVEL_ORDER.slice(0, idx + 1)
    }
  }
  const isProd = process.env["NODE_ENV"] === "production"
  return isProd ? ["error", "warn", "log"] : [...LEVEL_ORDER]
}

/** Off unless API_HTTP_LOG=1/true; in non-production defaults to on. */
export function shouldLogHttpRequests(): boolean {
  const v = process.env["API_HTTP_LOG"]?.trim().toLowerCase()
  if (v === "0" || v === "false" || v === "no" || v === "off") {
    return false
  }
  if (v === "1" || v === "true" || v === "yes" || v === "on") {
    return true
  }
  return process.env["NODE_ENV"] !== "production"
}

export function installHttpRequestLogger(app: INestApplication, enabled: boolean): void {
  if (!enabled) {
    return
  }
  const log = new Logger("HTTP")
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now()
    res.on("finish", () => {
      const ms = Date.now() - start
      log.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`)
    })
    next()
  })
}
