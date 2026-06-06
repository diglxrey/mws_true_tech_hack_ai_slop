import { Global, Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import Redis from "ioredis"
import { RenderCacheService } from "./render-cache.service"

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: "REDIS",
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>("REDIS_URL")
        return new Redis(url)
      },
    },
    RenderCacheService,
  ],
  exports: ["REDIS", RenderCacheService],
})
export class RedisModule {}
