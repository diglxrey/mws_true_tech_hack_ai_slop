import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common"
import { WikiPagesRepository } from "./wiki-pages.repository"

@Controller("wiki/tags")
export class WikiTagsController {
  constructor(private readonly pagesRepo: WikiPagesRepository) {}

  @Get()
  listTags(@Query("q") query?: string) {
    return this.pagesRepo.listTags(query)
  }

  @Post()
  createTag(@Body() body: { name?: string }) {
    const name = body.name?.trim().toLowerCase()
    if (!name) {
      throw new BadRequestException("name is required")
    }
    return this.pagesRepo.upsertTag(name)
  }
}
