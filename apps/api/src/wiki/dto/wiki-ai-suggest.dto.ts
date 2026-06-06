import { IsString } from "class-validator"

export class WikiAiSuggestDto {
  @IsString()
  prompt!: string

  @IsString()
  context!: string
}
