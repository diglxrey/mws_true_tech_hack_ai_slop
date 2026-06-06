import { Module } from "@nestjs/common"
import { DbModule } from "../db/db.module"
import { RedisModule } from "../redis/redis.module"
import { HealthController } from "./health.controller"

@Module({
  imports: [DbModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
