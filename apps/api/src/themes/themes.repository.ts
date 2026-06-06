import { Inject, Injectable } from "@nestjs/common"
import type { Pool } from "pg"
import type { SnippetThemeEntity } from "./theme.entity"

function mapRow(r: SnippetThemeEntity & { variables: unknown }): SnippetThemeEntity {
  const vars = r.variables
  const variables: Record<string, string> = {}
  if (vars && typeof vars === "object" && !Array.isArray(vars)) {
    for (const [k, v] of Object.entries(vars as Record<string, unknown>)) {
      variables[k] = v == null ? "" : String(v)
    }
  }
  return { id: r.id, name: r.name, variables, is_default: r.is_default }
}

@Injectable()
export class ThemesRepository {
  constructor(@Inject("META_PG_POOL") private readonly pool: Pool) {}

  async findAll(): Promise<SnippetThemeEntity[]> {
    const { rows } = await this.pool.query(`SELECT * FROM snippet_themes ORDER BY name`)
    return rows.map((r) => mapRow(r as SnippetThemeEntity & { variables: unknown }))
  }

  async findByName(name: string): Promise<SnippetThemeEntity | null> {
    const { rows } = await this.pool.query(`SELECT * FROM snippet_themes WHERE name = $1`, [name])
    if (rows.length === 0) return null
    return mapRow(rows[0] as SnippetThemeEntity & { variables: unknown })
  }

  async findById(id: string): Promise<SnippetThemeEntity | null> {
    const { rows } = await this.pool.query(`SELECT * FROM snippet_themes WHERE id = $1`, [id])
    if (rows.length === 0) return null
    return mapRow(rows[0] as SnippetThemeEntity & { variables: unknown })
  }

  async create(input: { name: string; variables: Record<string, string>; is_default?: boolean }) {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      if (input.is_default) {
        await client.query(`UPDATE snippet_themes SET is_default = false WHERE is_default = true`)
      }
      const { rows } = await client.query<SnippetThemeEntity>(
        `INSERT INTO snippet_themes (name, variables, is_default)
         VALUES ($1, $2::jsonb, $3)
         RETURNING *`,
        [input.name, JSON.stringify(input.variables), input.is_default ?? false],
      )
      await client.query("COMMIT")
      return mapRow(rows[0] as SnippetThemeEntity & { variables: unknown })
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async update(
    id: string,
    input: Partial<{ name: string; variables: Record<string, string>; is_default: boolean }>,
  ): Promise<SnippetThemeEntity | null> {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      if (input.is_default === true) {
        await client.query(`UPDATE snippet_themes SET is_default = false WHERE is_default = true AND id <> $1`, [
          id,
        ])
      }
      const fields: string[] = []
      const values: unknown[] = []
      let i = 1
      const push = (name: string, v: unknown) => {
        fields.push(`${name} = $${i}`)
        values.push(v)
        i += 1
      }
      if (input.name !== undefined) push("name", input.name)
      if (input.variables !== undefined) {
        fields.push(`variables = $${i}::jsonb`)
        values.push(JSON.stringify(input.variables))
        i += 1
      }
      if (input.is_default !== undefined) push("is_default", input.is_default)
      if (fields.length === 0) {
        await client.query("COMMIT")
        return this.findById(id)
      }
      values.push(id)
      const { rows } = await client.query<SnippetThemeEntity>(
        `UPDATE snippet_themes SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
        values,
      )
      await client.query("COMMIT")
      return rows[0] ? mapRow(rows[0] as SnippetThemeEntity & { variables: unknown }) : null
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`DELETE FROM snippet_themes WHERE id = $1`, [id])
    return (rowCount ?? 0) > 0
  }
}
