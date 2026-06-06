import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { ConfigModule } from "@nestjs/config"
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { ConfigHelperModule } from "./config/config-helper.module"
import { validateEnv } from "./config/env.validation"
import { DbModule } from "./db/db.module"
import { MwsModule } from "./mws/mws.module"
import { RedisModule } from "./redis/redis.module"
import { AiModule } from "./ai/ai.module"
import { TracingShutdownService } from "./tracing-shutdown.service"
import { EmbedModule } from "./embed/embed.module"
import { FilesModule } from "./files/files.module"
import { HealthModule } from "./health/health.module"
import { InternalModule } from "./internal/internal.module"
import { SnippetsModule } from "./snippets/snippets.module"
import { StorageModule } from "./storage/storage.module"
import { WikiModule } from "./wiki/wiki.module"
import { AuthModule } from "./auth/auth.module"
import { AuthGuard } from "./auth/auth.guard"
import { RolesGuard } from "./auth/roles.guard"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Default `.env` is cwd; from monorepo root use `../.env` when dev runs in `apps/api`
      envFilePath: [".env", "../.env", "../../.env"],
      validate: validateEnv,
    }),
    ConfigHelperModule,
    ThrottlerModule.forRoot({
      throttlers: [
        { name: "public", ttl: 60_000, limit: 100 },
        { name: "admin", ttl: 60_000, limit: 60 },
      ],
    }),
    DbModule,
    MwsModule,
    RedisModule,
    StorageModule,
    AuthModule,
    SnippetsModule,
    EmbedModule,
    HealthModule,
    InternalModule,
    FilesModule,
    AiModule,
    WikiModule,
  ],
  providers: [
    TracingShutdownService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
