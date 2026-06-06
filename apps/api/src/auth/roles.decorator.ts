import { SetMetadata } from "@nestjs/common"

export const ROLES_KEY = "roles"

/** Restrict access to users whose `groups` claim contains at least one of the given roles. */
export const RequireRoles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)
