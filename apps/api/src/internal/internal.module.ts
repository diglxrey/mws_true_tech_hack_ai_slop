import { Module } from "@nestjs/common"
import { MetaModule } from "../meta/meta.module"
import { SnippetsModule } from "../snippets/snippets.module"
import { InternalMetaController } from "./internal-meta.controller"
import { InternalSnippetsController } from "./internal-snippets.controller"

@Module({
  imports: [SnippetsModule, MetaModule],
  controllers: [InternalSnippetsController, InternalMetaController],
})
export class InternalModule {}
