import { Inject, Injectable } from "@nestjs/common"
import type { Pool } from "pg"
import type { AuthUser } from "./auth.types"

@Injectable()
export class UserDirectoryRepository {
  constructor(@Inject("META_PG_POOL") private readonly pool: Pool) {}

  async upsert(user: AuthUser): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (sub, email, name, groups, last_login)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (sub) DO UPDATE
         SET email      = EXCLUDED.email,
             name       = EXCLUDED.name,
             groups     = EXCLUDED.groups,
             last_login = now()`,
      [user.sub, user.email ?? null, user.name ?? null, JSON.stringify(user.groups)],
    )
  }

  async findBySubs(subs: string[]): Promise<Array<{ sub: string; email: string | null; name: string | null }>> {
    if (subs.length === 0) return []
    const { rows } = await this.pool.query<{ sub: string; email: string | null; name: string | null }>(
      `SELECT sub, email, name FROM users WHERE sub = ANY($1::text[])`,
      [subs],
    )
    return rows
  }
}
