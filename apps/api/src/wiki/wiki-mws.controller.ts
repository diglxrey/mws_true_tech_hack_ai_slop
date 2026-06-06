import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Put,
  Query,
} from "@nestjs/common"
import { WikiMwsService } from "./wiki-mws.service"
import type {
  ResolveMwsAggregateDto,
  ResolveMwsSnippetValueDto,
  UpsertMwsBlockConfigDto,
} from "./wiki.types"

@Controller("wiki/mws")
export class WikiMwsController {
  constructor(private readonly mwsService: WikiMwsService) {}

  @Get("datasheets")
  listDatasheets() {
    return this.mwsService.listDatasheets()
  }

  @Get("datasheets/:dstId/fields")
  getFields(
    @Param("dstId") dstId: string,
    @Query("viewId") viewId?: string,
  ) {
    return this.mwsService.getFields(dstId, viewId)
  }

  @Get("datasheets/:dstId/records")
  getRecords(
    @Param("dstId") dstId: string,
    @Query("viewId") viewId?: string,
    @Query("filterByFormula") filterByFormula?: string,
    @Query("pageSize") pageSize?: string,
    @Query("pageNum") pageNum?: string,
    @Query("fieldKey") fieldKey?: "name" | "id",
    @Query("refreshIntervalSecs") refreshIntervalSecs?: string,
  ) {
    const ttl = refreshIntervalSecs ? parseInt(refreshIntervalSecs, 10) : 30
    return this.mwsService.getRecords(
      dstId,
      {
        viewId,
        filterByFormula,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
        pageNum: pageNum ? parseInt(pageNum, 10) : undefined,
        fieldKey: fieldKey ?? "name",
      },
      ttl,
    )
  }

  @Get("datasheets/:dstId/snippet-value")
  getSnippetValue(
    @Param("dstId") dstId: string,
    @Query("pkColumn") pkColumn?: string,
    @Query("pkValue") pkValue?: string,
    @Query("valueColumn") valueColumn?: string,
    @Query("viewId") viewId?: string,
  ) {
    const dto: ResolveMwsSnippetValueDto = {
      pk_column: pkColumn ?? "",
      pk_value: pkValue ?? "",
      value_column: valueColumn ?? "",
      view_id: viewId,
    }
    return this.mwsService.resolveSnippetValue(dstId, dto)
  }

  @Get("datasheets/:dstId/aggregate")
  getAggregateValue(
    @Param("dstId") dstId: string,
    @Query("kind") kind?: string,
    @Query("column") column?: string,
    @Query("viewId") viewId?: string,
    @Query("filterByFormula") filterByFormula?: string,
  ) {
    const dto: ResolveMwsAggregateDto = {
      kind: (kind ?? "count") as ResolveMwsAggregateDto["kind"],
      column,
      view_id: viewId,
      filter_by_formula: filterByFormula,
    }
    return this.mwsService.resolveAggregateValue(dstId, dto)
  }

  @Patch("datasheets/:dstId/records/:recordId")
  async patchRecord(
    @Param("dstId") dstId: string,
    @Param("recordId") recordId: string,
    @Body() body: { fields: Record<string, unknown> },
  ) {
    await this.mwsService.patchRecord(dstId, recordId, body.fields)
    return { success: true }
  }

  @Get("pages/:pageId/blocks/:blockId/config")
  async getBlockConfig(
    @Param("pageId") pageId: string,
    @Param("blockId") blockId: string,
  ) {
    const cfg = await this.mwsService.getBlockConfig(pageId, blockId)
    if (!cfg) throw new NotFoundException("MWS block config not found")
    return cfg
  }

  @Put("pages/:pageId/blocks/:blockId/config")
  upsertBlockConfig(
    @Param("pageId") pageId: string,
    @Param("blockId") blockId: string,
    @Body() body: UpsertMwsBlockConfigDto,
  ) {
    return this.mwsService.upsertBlockConfig(pageId, blockId, body)
  }
}
