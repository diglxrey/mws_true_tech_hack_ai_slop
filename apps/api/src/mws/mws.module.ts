import { Global, Module } from "@nestjs/common"
import { FusionClientService } from "./fusion-client.service"

@Global()
@Module({
  providers: [FusionClientService],
  exports: [FusionClientService],
})
export class MwsModule {}
