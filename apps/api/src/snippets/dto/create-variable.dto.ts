import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator"

export class CreateVariableDto {
  @IsString()
  @MinLength(1)
  placeholder_name!: string

  @IsString()
  @IsIn(["scalar", "aggregate", "concat"])
  mode!: "scalar" | "aggregate" | "concat"

  @IsString()
  @MinLength(1)
  source_table!: string

  @IsString()
  @MinLength(1)
  source_column!: string

  @IsOptional()
  @IsString()
  aggregate_fn?: string | null

  @IsOptional()
  @IsString()
  concat_separator?: string | null

  @IsOptional()
  @IsString()
  concat_order_column?: string | null

  @IsOptional()
  @IsIn(["ASC", "DESC"])
  concat_order_dir?: "ASC" | "DESC" | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  concat_limit?: number | null

  @IsOptional()
  filters?: unknown

  @IsOptional()
  @IsString()
  fallback_value?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number
}
