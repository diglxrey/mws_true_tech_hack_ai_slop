import "./load-env-for-instrumentation"
import "./instrumentation"
import type { IncomingMessage, Server as HttpServer } from "node:http"
import { Logger, RequestMethod, ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { WsAdapter } from "@nestjs/platform-ws"
import { AppModule } from "./app.module"
import {
  installHttpRequestLogger,
  resolveNestLogLevels,
  shouldLogHttpRequests,
} from "./logging/bootstrap-logging"

// y-websocket appends "/{roomname}" to the base URL, producing
// e.g. /api/v1/wiki-collab/{pageId}.  NestJS WsAdapter (backed by the ws
// library) does an exact pathname match, so the gateway at
// "/api/v1/wiki-collab" never accepts those connections.
// We normalise the URL here — before the WsAdapter's upgrade listener fires —
// by moving the trailing pageId segment into a query-string parameter.
function prependWikiCollabUrlNormaliser(httpServer: HttpServer) {
  const PREFIX = "/api/v1/wiki-collab/"
  httpServer.prependListener("upgrade", (req: IncomingMessage) => {
    if (!req.url?.startsWith(PREFIX)) return
    try {
      const url = new URL(req.url, "http://localhost")
      const pageId = url.pathname.slice(PREFIX.length)
      if (pageId) {
        url.pathname = "/api/v1/wiki-collab"
        url.searchParams.set("pageId", pageId)
        req.url = url.pathname + url.search
      }
    } catch {
      // malformed URL — leave untouched; the gateway will close it
    }
  })
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: resolveNestLogLevels(),
  })
  installHttpRequestLogger(app, shouldLogHttpRequests())
  app.enableShutdownHooks()
  app.useWebSocketAdapter(new WsAdapter(app))
  // Must be registered before app.listen() so it runs before the WsAdapter's
  // own upgrade listeners (which are added during module initialisation inside listen()).
  prependWikiCollabUrlNormaliser(app.getHttpServer())
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "embed/(.*)", method: RequestMethod.GET },
      { path: "s/(.*)", method: RequestMethod.GET },
      { path: "sdk/(.*)", method: RequestMethod.GET },
    ],
  })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  const cors = process.env["CORS_ORIGIN"]
  if (cors) {
    const origins = cors.includes(",") ? cors.split(",").map((o) => o.trim()) : cors
    app.enableCors({ origin: origins })
  }
  const port = Number.parseInt(process.env["PORT"] ?? "3001", 10)
  await app.listen(port)
  new Logger("Bootstrap").log(`HTTP server listening on port ${port}`)
}

void bootstrap()
