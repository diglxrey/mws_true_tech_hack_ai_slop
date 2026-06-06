import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Pool } from "pg"

const MIGRATION_FILES = ["001_init.sql", "002_embed.sql", "003_wiki.sql", "004_wiki_tags.sql", "005_auth.sql"] as const

@Injectable()
export class MetaMigrationService implements OnModuleInit {
  private readonly log = new Logger(MetaMigrationService.name)

  constructor(@Inject("META_PG_POOL") private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const { rows } = await this.pool.query<{ name: string }>(`SELECT name FROM _migrations`)
    const applied = new Set(rows.map((r) => r.name))

    const dir = join(__dirname, "migrations")
    for (const name of MIGRATION_FILES) {
      if (applied.has(name)) {
        this.log.log(`Skipping already-applied migration ${name}`)
        continue
      }
      const sql = readFileSync(join(dir, name), "utf8")
      await this.pool.query(sql)
      await this.pool.query(`INSERT INTO _migrations (name) VALUES ($1)`, [name])
      this.log.log(`Applied migration ${name}`)
    }
    this.log.log("Meta DB schema ready")
  }
}
