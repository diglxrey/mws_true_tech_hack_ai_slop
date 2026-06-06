import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common"
import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from "class-validator"
import { ThemesService } from "./themes.service"
import { RequireRoles } from "../auth/roles.decorator"

class CreateThemeDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsObject()
  variables!: Record<string, string>

  @IsOptional()
  @IsBoolean()
  is_default?: boolean
}

class UpdateThemeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>

  @IsOptional()
  @IsBoolean()
  is_default?: boolean
}

@Controller("themes")
export class ThemesController {
  constructor(private readonly themes: ThemesService) {}

  @Get()
  list() {
    return this.themes.list()
  }

  @Post()
  @RequireRoles("admin")
  create(@Body() body: CreateThemeDto) {
    return this.themes.create(body)
  }

  @Put(":id")
  @RequireRoles("admin")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateThemeDto) {
    return this.themes.update(id, body)
  }

  @Delete(":id")
  @RequireRoles("admin")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.themes.remove(id)
  }
}
