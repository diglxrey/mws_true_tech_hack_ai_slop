import { Module } from "@nestjs/common"
import { AiChatGateway } from "./ai-chat.gateway"
import { AiChatService } from "./ai-chat.service"
import { AiLangfuseService } from "./ai-langfuse.service"
import { AiSystemPromptService } from "./ai-system-prompt.service"

@Module({
  providers: [AiChatGateway, AiChatService, AiSystemPromptService, AiLangfuseService],
})
export class AiModule {}
