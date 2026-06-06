import { Controller, Get, HttpStatus, Param, UseFilters } from "@nestjs/common"
import { MetaService } from "../meta/meta.service"
import { InternalExceptionFilter } from "./internal-exception.filter"
import { InternalToolHttpException } from "./internal-tool-error"
import { Public } from "../auth/public.decorator"

@Public()
@Controller("internal/meta")
@UseFilters(InternalExceptionFilter)
export class InternalMetaController {
  constructor(private readonly meta: MetaService) {}

  @Get("tables")
  listTables() {
    return this.meta.listFusionMetaTables()
  }

  @Get("tables/:name/columns")
  async listColumns(@Param("name") name: string) {
    const tables = await this.meta.listFusionMetaTables()
    if (!tables.some((t) => t.table_name === name)) {
      throw new InternalToolHttpException(
        "TABLE_NOT_FOUND",
        `Table '${name}' not found`,
        HttpStatus.NOT_FOUND,
      )
    }
    return this.meta.listFusionMetaColumns(name)
  }
}
