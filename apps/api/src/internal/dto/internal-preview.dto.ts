import { IsObject, IsOptional } from "class-validator"

export class InternalPreviewDto {
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>
}
