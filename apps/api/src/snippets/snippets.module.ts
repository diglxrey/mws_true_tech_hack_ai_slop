import { Module } from "@nestjs/common"
import { MetaModule } from "../meta/meta.module"
import { RenderService } from "./render.service"
import { SnippetsAdminController, VariablesAdminController } from "./snippets-admin.controller"
import { SnippetsPublicController } from "./snippets-public.controller"
import { SnippetsRepository } from "./snippets.repository"
import { SnippetsService } from "./snippets.service"
import { CssSanitizeService } from "./sanitize/css-sanitize.service"
import { HtmlSanitizeService } from "./sanitize/html-sanitize.service"

@Module({
  imports: [MetaModule],
  controllers: [SnippetsPublicController, SnippetsAdminController, VariablesAdminController],
  providers: [
    SnippetsRepository,
    SnippetsService,
    RenderService,
    HtmlSanitizeService,
    CssSanitizeService,
  ],
  exports: [SnippetsService, SnippetsRepository, RenderService],
})
export class SnippetsModule {}
