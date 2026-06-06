import { Module } from "@nestjs/common"
import { MwsModule } from "../mws/mws.module"
import { WikiPagesRepository } from "./wiki-pages.repository"
import { WikiPagesController } from "./wiki-pages.controller"
import { WikiCommentsRepository } from "./wiki-comments.repository"
import { WikiCommentsController } from "./wiki-comments.controller"
import { WikiVersionsRepository } from "./wiki-versions.repository"
import { WikiVersionsController } from "./wiki-versions.controller"
import { WikiGraphService } from "./wiki-graph.service"
import { WikiGraphController } from "./wiki-graph.controller"
import { WikiMwsService } from "./wiki-mws.service"
import { WikiMwsController } from "./wiki-mws.controller"
import { WikiAiService } from "./wiki-ai.service"
import { WikiAiController } from "./wiki-ai.controller"
import { WikiCollabGateway } from "./wiki-collab.gateway"
import { WikiRelationsService } from "./wiki-relations.service"
import { WikiTagsController } from "./wiki-tags.controller"

@Module({
  imports: [MwsModule],
  controllers: [
    WikiPagesController,
    WikiCommentsController,
    WikiVersionsController,
    WikiGraphController,
    WikiMwsController,
    WikiAiController,
    WikiTagsController,
  ],
  providers: [
    WikiPagesRepository,
    WikiCommentsRepository,
    WikiVersionsRepository,
    WikiGraphService,
    WikiMwsService,
    WikiAiService,
    WikiCollabGateway,
    WikiRelationsService,
  ],
  exports: [WikiPagesRepository],
})
export class WikiModule {}
