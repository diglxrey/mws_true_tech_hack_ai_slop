import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common"
import { stringifyContext } from "../common/context-query.util"
import { CreateSnippetDto } from "./dto/create-snippet.dto"
import { CreateVariableDto } from "./dto/create-variable.dto"
import { DuplicateSnippetDto } from "./dto/duplicate-snippet.dto"
import { RenderBodyDto } from "./dto/render-body.dto"
import { SnippetsService } from "./snippets.service"
import { RequireRoles } from "../auth/roles.decorator"

@RequireRoles("admin")
@Controller("admin/snippets")
export class SnippetsAdminController {
  constructor(private readonly snippets: SnippetsService) {}

  @Get()
  list() {
    return this.snippets.listAdmin()
  }

  @Get(":id/embed-code")
  embedCode(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("format") format?: string,
  ) {
    const f =
      format === "webcomponent" ? "webcomponent" : format === "share" ? "share" : "iframe"
    return this.snippets.getEmbedCode(id, f)
  }

  @Get(":id")
  getOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.snippets.getByIdOrThrow(id)
  }

  @Post()
  create(@Body() body: CreateSnippetDto) {
    return this.snippets.createSnippet(body)
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() body: Partial<CreateSnippetDto>) {
    return this.snippets.updateSnippet(id, body)
  }

  @Delete(":id")
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.snippets.deleteSnippet(id)
    return { ok: true }
  }

  @Post(":id/duplicate")
  duplicate(@Param("id", ParseUUIDPipe) id: string, @Body() body: DuplicateSnippetDto) {
    return this.snippets.duplicateSnippet(id, body.newSlug)
  }

  @Post(":id/variables")
  async addVariable(@Param("id", ParseUUIDPipe) id: string, @Body() body: CreateVariableDto) {
    return this.snippets.addVariable(id, body)
  }

  @Post(":id/preview")
  preview(@Param("id", ParseUUIDPipe) id: string, @Body() body: RenderBodyDto) {
    const context = stringifyContext(body.context ?? {})
    return this.snippets.previewAdminSnippet(id, context)
  }
}

@RequireRoles("admin")
@Controller("admin/variables")
export class VariablesAdminController {
  constructor(private readonly snippets: SnippetsService) {}

  @Patch(":variableId")
  patchVar(@Param("variableId", ParseUUIDPipe) variableId: string, @Body() body: Partial<CreateVariableDto>) {
    return this.snippets.patchVariable(variableId, body)
  }

  @Delete(":variableId")
  async delVar(@Param("variableId", ParseUUIDPipe) variableId: string) {
    await this.snippets.removeVariable(variableId)
    return { ok: true }
  }

  @Post(":variableId/test")
  testVar(
    @Param("variableId", ParseUUIDPipe) variableId: string,
    @Body() body: RenderBodyDto,
  ) {
    const context = stringifyContext(body.context ?? {})
    return this.snippets.testVariable(variableId, context)
  }

  @Post(":variableId/sql-preview")
  async sqlPreview(
    @Param("variableId", ParseUUIDPipe) variableId: string,
    @Body() body: RenderBodyDto,
  ) {
    const context = stringifyContext(body.context ?? {})
    return this.snippets.previewSql(variableId, context)
  }
}
