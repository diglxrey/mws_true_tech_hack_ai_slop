import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createRemoteJWKSet, jwtVerify, type JWTVerifyResult, type JWTPayload } from "jose"
import type { AuthUser } from "./auth.types"

interface DexJwtPayload extends JWTPayload {
  email?: string
  name?: string
  preferred_username?: string
  groups?: string[]
}

@Injectable()
export class JwtVerifierService {
  private readonly log = new Logger(JwtVerifierService.name)
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | null
  private readonly issuer: string
  private readonly audience: string
  readonly isConfigured: boolean

  constructor(private readonly config: ConfigService) {
    const jwksUri = this.config.get<string>("OIDC_JWKS_URI")
    this.issuer = this.config.get<string>("OIDC_ISSUER") ?? ""
    this.audience = this.config.get<string>("OIDC_AUDIENCE") ?? ""

    if (jwksUri) {
      this.jwks = createRemoteJWKSet(new URL(jwksUri), { cacheMaxAge: 15 * 60_000 })
      this.isConfigured = true
    } else {
      this.jwks = null
      this.isConfigured = false
      this.log.warn("OIDC_JWKS_URI not set — JWT auth disabled, all requests will be allowed")
    }
  }

  async verify(token: string): Promise<AuthUser> {
    if (!this.jwks) {
      throw new Error("JwtVerifierService: OIDC not configured")
    }
    let result: JWTVerifyResult<DexJwtPayload>
    try {
      result = await jwtVerify<DexJwtPayload>(token, this.jwks, {
        issuer: this.issuer || undefined,
        audience: this.audience || undefined,
      })
    } catch (err) {
      this.log.debug(`JWT verification failed: ${String(err)}`)
      throw err
    }

    const payload = result.payload
    const sub = payload.sub
    if (!sub) {
      throw new Error("JWT missing sub claim")
    }

    const preferred =
      typeof payload.preferred_username === "string" ? payload.preferred_username.trim() : ""
    const fullName = typeof payload.name === "string" ? payload.name.trim() : ""
    const email = typeof payload.email === "string" ? payload.email.trim() : ""
    const localFromEmail = email.includes("@") ? email.slice(0, email.indexOf("@")) : ""
    const username = preferred || fullName || localFromEmail || sub

    return {
      sub,
      email: payload.email,
      name: payload.name,
      username,
      groups: Array.isArray(payload.groups) ? payload.groups : [],
    }
  }
}
