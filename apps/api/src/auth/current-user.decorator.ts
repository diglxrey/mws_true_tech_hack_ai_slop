import { createParamDecorator, type ExecutionContext } from "@nestjs/common"
import type { Request } from "express"
import type { AuthUser } from "./auth.types"

/** Inject the authenticated user (set by AuthGuard) into a controller method parameter. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>()
  return req.user as AuthUser
})
