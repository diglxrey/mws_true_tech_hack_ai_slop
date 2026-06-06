import { Controller, Get, Param } from "@nestjs/common"
import { WikiGraphService } from "./wiki-graph.service"

@Controller("wiki/graph")
export class WikiGraphController {
  constructor(private readonly graphService: WikiGraphService) {}

  @Get()
  getFullGraph() {
    return this.graphService.getFullGraph()
  }

  @Get("page/:id")
  getEgoGraph(@Param("id") id: string) {
    return this.graphService.getEgoGraph(id)
  }
}
