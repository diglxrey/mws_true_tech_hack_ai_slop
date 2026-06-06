import { Module } from "@nestjs/common"
import { CssSanitizeService } from "../snippets/sanitize/css-sanitize.service"
import { SnippetsModule } from "../snippets/snippets.module"
import { ThemesModule } from "../themes/themes.module"
import { EmbedController } from "./embed.controller"
import { EmbedPageService } from "./embed-page.service"
import { SdkController } from "./sdk.controller"
import { ShareController } from "./share.controller"
import { SharePageService } from "./share-page.service"

@Module({
  imports: [SnippetsModule, ThemesModule],
  controllers: [EmbedController, ShareController, SdkController],
  providers: [EmbedPageService, SharePageService, CssSanitizeService],
  exports: [EmbedPageService, SharePageService],
})
export class EmbedModule {}
