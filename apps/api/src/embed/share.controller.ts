import { Controller, Get, Param, Query, Res } from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import type { Response } from "express"
import { queryStringRecord } from "../common/context-query.util"
import { SharePageService } from "./share-page.service"
import { Public } from "../auth/public.decorator"

@Controller("s")
@Public()
@Throttle({ default: { limit: 200, ttl: 60_000 } })
export class ShareController {
  constructor(private readonly sharePage: SharePageService) {}

  @Get(":slug")
  async getShare(
    @Param("slug") slug: string,
    @Query() query: Record<string, string | string[]>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const flat = queryStringRecord(query)
    const { html, fromCache } = await this.sharePage.renderSharePage(slug, flat)
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; connect-src 'none'; script-src 'none'; frame-ancestors 'none'",
    )
    res.setHeader("X-Cache", fromCache ? "HIT" : "MISS")
    return html
  }
}
