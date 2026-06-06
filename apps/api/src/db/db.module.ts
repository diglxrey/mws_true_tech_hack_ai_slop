import { Global, Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { Pool } from "pg"
import { MetaMigrationService } from "./meta-migration.service"

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: "META_PG_POOL",
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>("META_DATABASE_URL")
        return new Pool({ connectionString: url, max: 10 })
      },
    },
    MetaMigrationService,
  ],
  exports: ["META_PG_POOL"],
})
export class DbModule {}
