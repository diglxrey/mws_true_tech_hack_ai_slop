import { ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { ThemesRepository } from "./themes.repository"

@Injectable()
export class ThemesService {
  constructor(private readonly repo: ThemesRepository) {}

  list() {
    return this.repo.findAll()
  }

  async create(body: { name: string; variables: Record<string, string>; is_default?: boolean }) {
    try {
      return await this.repo.create(body)
    } catch (e: unknown) {
      const err = e as { code?: string }
      if (err.code === "23505") {
        throw new ConflictException("theme name already exists")
      }
      throw e
    }
  }

  async update(
    id: string,
    body: Partial<{ name: string; variables: Record<string, string>; is_default: boolean }>,
  ) {
    const row = await this.repo.update(id, body)
    if (!row) throw new NotFoundException()
    return row
  }

  async remove(id: string) {
    const ok = await this.repo.delete(id)
    if (!ok) throw new NotFoundException()
    return { ok: true as const }
  }
}
