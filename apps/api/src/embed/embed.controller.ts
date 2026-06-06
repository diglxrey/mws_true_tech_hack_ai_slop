import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import type { Request, Response } from "express"
import { queryStringRecord } from "../common/context-query.util"
import { EmbedPageService } from "./embed-page.service"
import { Public } from "../auth/public.decorator"

function buildFrameAncestors(allowedOrigins: string[]): string {
  if (allowedOrigins.length === 0) return "'self'"
  return allowedOrigins.join(" ")
}

@Controller("embed")
@Public()
@Throttle({ public: { limit: 500, ttl: 60_000 } })
export class EmbedController {
  constructor(private readonly embedPage: EmbedPageService) {}

  @Get(":slug")
  async getEmbed(
    @Param("slug") slug: string,
    @Query() query: Record<string, string | string[]>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const flat = queryStringRecord(query)
    const { html, fromCache, corsHeaders, allowedOrigins } = await this.embedPage.renderEmbedPage(
      slug,
      flat,
      req.headers.origin,
    )
    const frameAncestors = buildFrameAncestors(allowedOrigins)
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; connect-src 'none'; script-src 'unsafe-inline'; frame-ancestors ${frameAncestors}`,
    )
    res.setHeader("X-Cache", fromCache ? "HIT" : "MISS")
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.setHeader(k, v)
    }
    return html
  }
}
