import { Module } from "@nestjs/common"
import { ThemesController } from "./themes.controller"
import { ThemesRepository } from "./themes.repository"
import { ThemesService } from "./themes.service"

@Module({
  controllers: [ThemesController],
  providers: [ThemesRepository, ThemesService],
  exports: [ThemesRepository, ThemesService],
})
export class ThemesModule {}
