import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator"

export class CreateSnippetDto {
  @IsString()
  @MinLength(1)
  slug!: string

  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsString()
  template!: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400 * 365)
  cache_ttl_seconds?: number

  @IsOptional()
  @IsBoolean()
  is_active?: boolean

  @IsOptional()
  @IsIn(["text", "html"])
  render_mode?: "text" | "html"

  @IsOptional()
  @IsString()
  html_template?: string | null

  @IsOptional()
  @IsString()
  css?: string | null

  @IsOptional()
  @IsObject()
  theme?: Record<string, string> | null

  @IsOptional()
  @IsBoolean()
  is_public?: boolean

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_origins?: string[]

  @IsOptional()
  @IsString()
  embed_width?: string | null

  @IsOptional()
  @IsString()
  embed_height?: string | null
}
