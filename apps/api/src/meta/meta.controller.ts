import { Controller, Get, Param } from "@nestjs/common"
import { MetaService } from "./meta.service"
import { RequireRoles } from "../auth/roles.decorator"

@RequireRoles("admin")
@Controller("meta")
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  /** Datasheets in configured MWS space: `table_name` is dstId, `display_name` for UI. */
  @Get("tables")
  listTables() {
    return this.meta.listFusionMetaTables()
  }

  @Get("tables/:name/columns")
  listColumns(@Param("name") name: string) {
    return this.meta.listColumns(name)
  }
}
