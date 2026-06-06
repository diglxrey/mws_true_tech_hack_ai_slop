import { Injectable } from "@nestjs/common"
import { UserDirectoryRepository } from "./user-directory.repository"
import type { AuthUser } from "./auth.types"

@Injectable()
export class UserDirectoryService {
  constructor(private readonly repo: UserDirectoryRepository) {}

  /** Upsert user record and update last_login. Fire-and-forget on each authenticated request. */
  async touch(user: AuthUser): Promise<void> {
    await this.repo.upsert(user)
  }

  /** Batch lookup by sub for display purposes (avatar, name in UI). */
  findBySubs(subs: string[]) {
    return this.repo.findBySubs(subs)
  }
}
