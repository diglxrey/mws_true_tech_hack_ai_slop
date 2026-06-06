import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common"
import { queryStringRecord, stringifyContext } from "../common/context-query.util"
import { RenderBodyDto } from "./dto/render-body.dto"
import { SnippetsService } from "./snippets.service"
import { Public } from "../auth/public.decorator"

@Controller("snippets")
@Public()
export class SnippetsPublicController {
  constructor(private readonly snippets: SnippetsService) {}

  @Get()
  list() {
    return this.snippets.listPublic()
  }

  @Get(":slug")
  async renderGet(@Param("slug") slug: string, @Query() query: Record<string, string | string[]>) {
    const context = queryStringRecord(query)
    return this.snippets.renderBySlug(slug, context)
  }

  @Post(":slug/render")
  async renderPost(@Param("slug") slug: string, @Body() body: RenderBodyDto) {
    const context = stringifyContext(body.context ?? {})
    return this.snippets.renderBySlug(slug, context)
  }
}
