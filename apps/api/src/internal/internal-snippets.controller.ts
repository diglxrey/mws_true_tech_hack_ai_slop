import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseFilters,
} from "@nestjs/common"
import { stringifyContext } from "../common/context-query.util"
import { CreateSnippetDto } from "../snippets/dto/create-snippet.dto"
import { CreateVariableDto } from "../snippets/dto/create-variable.dto"
import { Public } from "../auth/public.decorator"
import { SnippetsService } from "../snippets/snippets.service"
import type { SnippetVariableRow } from "../sql/sql-builder.types"
import { InternalPreviewDto } from "./dto/internal-preview.dto"
import { InternalUpdateSnippetDto } from "./dto/internal-update-snippet.dto"
import { InternalExceptionFilter } from "./internal-exception.filter"
import { InternalToolHttpException } from "./internal-tool-error"

function serializeVariable(v: SnippetVariableRow) {
  return {
    placeholder_name: v.placeholder_name,
    mode: v.mode,
    source_table: v.source_table,
    source_column: v.source_column,
    aggregate_fn: v.aggregate_fn,
    concat_separator: v.concat_separator,
    concat_order_column: v.concat_order_column,
    concat_order_dir: v.concat_order_dir,
    concat_limit: v.concat_limit,
    filters: v.filters,
    fallback_value: v.fallback_value,
  }
}

@Public()
@Controller("internal/snippets")
@UseFilters(InternalExceptionFilter)
export class InternalSnippetsController {
  constructor(private readonly snippets: SnippetsService) {}

  @Get()
  list() {
    return this.snippets.listForInternalTools()
  }

  @Get(":slug")
  async getOne(@Param("slug") slug: string) {
    const s = await this.snippets.getBySlugOrThrow(slug)
    return {
      slug: s.slug,
      name: s.name,
      description: s.description,
      template: s.template,
      cache_ttl_seconds: s.cache_ttl_seconds,
      is_active: s.is_active,
      render_mode: s.render_mode,
      html_template: s.html_template,
      css: s.css,
      theme: s.theme,
      is_public: s.is_public,
      allowed_origins: s.allowed_origins,
      embed_width: s.embed_width,
      embed_height: s.embed_height,
      variables: s.variables.map(serializeVariable),
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateSnippetDto) {
    const row = await this.snippets.createSnippet(body)
    return { slug: row.slug, created: true as const }
  }

  @Patch(":slug")
  async update(@Param("slug") slug: string, @Body() body: InternalUpdateSnippetDto) {
    await this.snippets.updateSnippetBySlug(slug, body)
    return { slug, updated: true as const }
  }

  @Delete(":slug")
  @HttpCode(HttpStatus.OK)
  async remove(@Param("slug") slug: string) {
    await this.snippets.deleteSnippetBySlug(slug)
    return { slug, deleted: true as const }
  }

  @Post(":slug/preview")
  async preview(@Param("slug") slug: string, @Body() body: InternalPreviewDto) {
    let context: Record<string, string>
    try {
      context = stringifyContext(body.context ?? {})
    } catch (e) {
      throw new InternalToolHttpException(
        "INVALID_PARAMS",
        e instanceof Error ? e.message : "Invalid context",
        HttpStatus.BAD_REQUEST,
      )
    }
    const payload = await this.snippets.previewSnippetBySlug(slug, context)
    return {
      text: payload.text,
      variables: payload.variables,
    }
  }

  @Post(":slug/variables")
  @HttpCode(HttpStatus.OK)
  setVariable(@Param("slug") slug: string, @Body() body: CreateVariableDto) {
    return this.snippets.setVariableBySlug(slug, body)
  }

  @Delete(":slug/variables/:placeholder")
  @HttpCode(HttpStatus.OK)
  deleteVariable(@Param("slug") slug: string, @Param("placeholder") placeholder: string) {
    return this.snippets.deleteVariableBySlug(slug, placeholder)
  }

  @Post(":slug/variables/:placeholder/test")
  async testVariable(
    @Param("slug") slug: string,
    @Param("placeholder") placeholder: string,
    @Body() body: InternalPreviewDto,
  ) {
    let context: Record<string, string>
    try {
      context = stringifyContext(body.context ?? {})
    } catch (e) {
      throw new InternalToolHttpException(
        "INVALID_PARAMS",
        e instanceof Error ? e.message : "Invalid context",
        HttpStatus.BAD_REQUEST,
      )
    }
    return this.snippets.testVariableBySlug(slug, placeholder, context)
  }
}
