import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { Request } from "express"
import { IS_PUBLIC_KEY } from "./public.decorator"
import { JwtVerifierService } from "./jwt-verifier.service"
import { UserDirectoryService } from "./user-directory.service"
import type { AuthUser } from "./auth.types"

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly log = new Logger(AuthGuard.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtVerifier: JwtVerifierService,
    private readonly userDirectory: UserDirectoryService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (isPublic) return true

    // If OIDC is not configured (no OIDC_JWKS_URI), allow all requests in dev mode
    if (!this.jwtVerifier.isConfigured) return true

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>()
    const token = this.extractBearerToken(req)
    if (!token) {
      throw new UnauthorizedException("Missing bearer token (Authorization header or access_token query)")
    }

    try {
      const user = await this.jwtVerifier.verify(token)
      req.user = user
      void this.userDirectory.touch(user).catch((e: unknown) => {
        this.log.warn(`User directory touch failed: ${String(e)}`)
      })
      return true
    } catch {
      throw new UnauthorizedException("Invalid or expired token")
    }
  }

  private extractBearerToken(req: Request): string | undefined {
    const auth = req.headers["authorization"]
    if (typeof auth === "string" && auth.startsWith("Bearer ")) {
      return auth.slice(7).trim()
    }
    // EventSource / browser SSE cannot set headers; same pattern as WS gateways (`access_token` query).
    const q = req.query["access_token"]
    if (typeof q === "string" && q.trim()) return q.trim()
    if (Array.isArray(q) && typeof q[0] === "string" && q[0].trim()) return q[0].trim()
    return undefined
  }
}
