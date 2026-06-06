import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common"
import type { CreatePageDto, UpdatePageDto } from "./wiki.types"
import { WikiPagesRepository } from "./wiki-pages.repository"
import { WikiRelationsService } from "./wiki-relations.service"
import { CurrentUser } from "../auth/current-user.decorator"
import type { AuthUser } from "../auth/auth.types"

@Controller("wiki/pages")
export class WikiPagesController {
  constructor(
    private readonly repo: WikiPagesRepository,
    private readonly relations: WikiRelationsService,
  ) {}

  @Get()
  listPages() {
    return this.repo.findAll()
  }

  @Post()
  createPage(@Body() body: CreatePageDto, @CurrentUser() user: AuthUser) {
    return this.repo.create({ ...body, created_by: user.sub })
  }

  @Get(":id")
  async getPage(@Param("id") id: string) {
    const page = await this.repo.findById(id)
    if (!page) throw new NotFoundException("Wiki page not found")
    return page
  }

  @Patch(":id")
  async updatePage(@Param("id") id: string, @Body() body: UpdatePageDto, @CurrentUser() user: AuthUser) {
    const beforeUpdate = await this.repo.findById(id)
    if (!beforeUpdate) throw new NotFoundException("Wiki page not found")

    const page = await this.repo.update(id, { ...body, updated_by: user.sub })
    if (!page) throw new NotFoundException("Wiki page not found")

    const titleChanged =
      typeof body.title === "string" &&
      body.title.trim().length > 0 &&
      body.title !== beforeUpdate.title
    if (titleChanged) {
      await this.relations.reindexAllPagesForRename(id, beforeUpdate.title)
    }

    return page
  }

  @Delete(":id")
  async deletePage(@Param("id") id: string) {
    await this.repo.softDelete(id)
    return { success: true }
  }

  @Get(":id/backlinks")
  getBacklinks(@Param("id") id: string) {
    return this.repo.findBacklinks(id)
  }

  @Put(":id/snapshot")
  async saveSnapshot(@Param("id") id: string, @Body() body: { state?: string }) {
    if (!body.state || typeof body.state !== "string") {
      throw new BadRequestException("state (base64) is required")
    }
    const buf = Buffer.from(body.state, "base64")
    await this.repo.saveSnapshot(id, buf)
    await this.relations.reindexPageFromSnapshot(id, buf)
    return { saved: true }
  }

  @Get(":id/snapshot")
  async getSnapshot(@Param("id") id: string) {
    const state = await this.repo.loadSnapshot(id)
    return { state: state ? state.toString("base64") : null }
  }
}
