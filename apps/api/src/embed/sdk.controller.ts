import { Controller, Get, Res } from "@nestjs/common"
import { SkipThrottle } from "@nestjs/throttler"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Response } from "express"
import { Public } from "../auth/public.decorator"

@SkipThrottle()
@Public()
@Controller("sdk/v1")
export class SdkController {
  @Get("snippet.js")
  getSdk(@Res({ passthrough: true }) res: Response) {
    const path = join(__dirname, "..", "sdk", "v1", "snippet.js")
    const body = readFileSync(path, "utf8")
    res.setHeader("Content-Type", "application/javascript; charset=utf-8")
    res.setHeader("Cache-Control", "public, max-age=3600")
    return body
  }
}
