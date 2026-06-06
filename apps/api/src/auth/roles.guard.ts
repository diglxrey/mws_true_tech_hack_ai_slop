import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { ROLES_KEY } from "./roles.decorator"
import { IS_PUBLIC_KEY } from "./public.decorator"
import type { Request } from "express"
import type { AuthUser } from "./auth.types"

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (isPublic) return true

    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!requiredRoles || requiredRoles.length === 0) return true

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>()
    const user = req.user
    if (!user) return false

    const hasRole = requiredRoles.some((role) => user.groups.includes(role))
    if (!hasRole) {
      throw new ForbiddenException(`Requires role: ${requiredRoles.join(" or ")}`)
    }
    return true
  }
}
