import { Body, Controller, Post, Res } from "@nestjs/common"
import type { Response } from "express"
import { WikiAiSuggestDto } from "./dto/wiki-ai-suggest.dto"
import { WikiAiService } from "./wiki-ai.service"

@Controller("wiki/ai")
export class WikiAiController {
  constructor(private readonly aiService: WikiAiService) {}

  /** SSE stream — POST body avoids URL length limits for full-page context */
  @Post("suggest")
  async suggestPost(@Body() body: WikiAiSuggestDto, @Res() res: Response): Promise<void> {
    await this.aiService.streamSuggestion(body.prompt ?? "", body.context ?? "", res)
  }

  @Post("summarize")
  async summarize(@Body() body: { content: string }) {
    const summary = await this.aiService.summarizePage(body.content ?? "")
    return { summary }
  }
}
