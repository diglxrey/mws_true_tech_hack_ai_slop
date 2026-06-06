import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common"
import * as Y from "yjs"
import type { CreateVersionDto } from "./wiki.types"
import { WikiVersionsRepository } from "./wiki-versions.repository"
import { WikiPagesRepository } from "./wiki-pages.repository"
import { WikiRelationsService } from "./wiki-relations.service"
import { CurrentUser } from "../auth/current-user.decorator"
import type { AuthUser } from "../auth/auth.types"

@Controller("wiki/pages/:pageId/versions")
export class WikiVersionsController {
  constructor(
    private readonly versionsRepo: WikiVersionsRepository,
    private readonly pagesRepo: WikiPagesRepository,
    private readonly relations: WikiRelationsService,
  ) {}

  @Get()
  listVersions(@Param("pageId") pageId: string) {
    return this.versionsRepo.findByPage(pageId)
  }

  @Post()
  async createVersion(@Param("pageId") pageId: string, @Body() body: CreateVersionDto, @CurrentUser() user: AuthUser) {
    let snapshot = await this.pagesRepo.loadSnapshot(pageId)
    if (!snapshot) {
      // Page predates snapshot feature — create an empty snapshot so versions work immediately
      const emptyDoc = new Y.Doc()
      snapshot = Buffer.from(Y.encodeStateAsUpdate(emptyDoc))
      await this.pagesRepo.saveSnapshot(pageId, snapshot)
      await this.relations.reindexPageFromSnapshot(pageId, snapshot)
    }
    return this.versionsRepo.create(pageId, snapshot, body.label, user.sub)
  }

  @Get(":versionId")
  async getVersion(@Param("versionId") versionId: string) {
    const v = await this.versionsRepo.findById(versionId)
    if (!v) throw new NotFoundException("Version not found")
    return v
  }

  @Post(":versionId/restore")
  @HttpCode(200)
  async restoreVersion(
    @Param("pageId") pageId: string,
    @Param("versionId") versionId: string,
  ) {
    const version = await this.versionsRepo.findById(versionId)
    if (!version) throw new NotFoundException("Version not found")

    // Auto-save current state as a backup version before restoring
    const currentSnapshot = await this.pagesRepo.loadSnapshot(pageId)
    if (currentSnapshot) {
      await this.versionsRepo.create(pageId, currentSnapshot, "Auto-backup before restore", "system")
    }

    const stateBuffer = Buffer.from(version.ydoc_state_b64, "base64")
    await this.pagesRepo.saveSnapshot(pageId, stateBuffer)
    await this.relations.reindexPageFromSnapshot(pageId, stateBuffer)
    return { restored: true, from_version: version.version_num }
  }
}
