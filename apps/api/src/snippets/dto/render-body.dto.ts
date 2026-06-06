import { IsObject, IsOptional } from "class-validator"

export class RenderBodyDto {
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>
}
