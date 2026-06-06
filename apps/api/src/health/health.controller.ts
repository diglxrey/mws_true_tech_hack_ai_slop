import { Controller, Get, Inject } from "@nestjs/common"
import { SkipThrottle } from "@nestjs/throttler"
import type { Pool } from "pg"
import type Redis from "ioredis"
import { Public } from "../auth/public.decorator"

@Controller("health")
@SkipThrottle()
@Public()
export class HealthController {
  constructor(
    @Inject("META_PG_POOL") private readonly pool: Pool,
    @Inject("REDIS") private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<{ status: string; db: boolean; redis: boolean }> {
    let db = false
    let redisOk = false
    try {
      await this.pool.query("SELECT 1")
      db = true
    } catch {
      // db unreachable
    }
    try {
      await this.redis.ping()
      redisOk = true
    } catch {
      // redis unreachable
    }
    return { status: db && redisOk ? "ok" : "degraded", db, redis: redisOk }
  }
}
