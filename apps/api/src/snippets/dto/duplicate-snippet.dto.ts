import { IsString, MinLength } from "class-validator"

export class DuplicateSnippetDto {
  @IsString()
  @MinLength(1)
  newSlug!: string
}
