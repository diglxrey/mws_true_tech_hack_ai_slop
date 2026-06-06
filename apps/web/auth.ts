// @ts-nocheck — next-auth beta + pnpm: TS2742 cannot name deep .pnpm path types (known issue)
import { normalizeCallbackUrl } from "@/lib/callback-url"
import NextAuth, { type NextAuthConfig, type NextAuthResult } from "next-auth"

// Public issuer — what dex puts in token `iss` claim and what the browser navigates to
const publicIssuer = process.env.OIDC_ISSUER ?? "http://localhost:5556/dex"
// Internal issuer — server-side fetches inside Docker use Docker DNS instead of localhost
const internalIssuer = process.env.OIDC_ISSUER_INTERNAL ?? publicIssuer

// Dex OIDC provider config.
// Explicit endpoints bypass auto-discovery so Docker's server-side calls reach
// http://dex:5556/dex/* while the browser authorization redirect uses the public URL.
const dexProvider = {
  id: "dex",
  name: "Dex",
  type: "oidc" as const,
  // issuer is used only for id_token `iss` claim validation — keep the public URL
  issuer: publicIssuer,
  clientId: process.env.AUTH_DEX_CLIENT_ID ?? "snippeter-web",
  clientSecret: process.env.AUTH_DEX_CLIENT_SECRET ?? "",
  authorization: {
    // Browser navigates here — must use the public host:port
    url: `${publicIssuer}/auth`,
    params: {
      scope: "openid email profile offline_access",
    },
  },
  // Server-side calls — use internal Docker DNS so localhost resolves correctly
  token: `${internalIssuer}/token`,
  userinfo: `${internalIssuer}/userinfo`,
  jwks_uri: `${internalIssuer}/keys`,
}

const authConfig = {
  /** Required behind nginx / other reverse proxies (see AUTH_URL, AUTH_TRUST_HOST in .env). */
  trustHost: process.env.AUTH_TRUST_HOST !== "false",
  providers: [dexProvider],
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      return normalizeCallbackUrl(url, baseUrl)
    },
    async jwt({ token, account, profile }) {
      // On first sign-in, store tokens from Dex
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at
        token.idToken = account.id_token
      }
      // Propagate groups/email/name from profile (Dex OIDC claims)
      if (profile) {
        const p = profile as Record<string, unknown>
        token.groups = Array.isArray(p["groups"]) ? (p["groups"] as string[]) : []
        token.email = typeof p["email"] === "string" ? p["email"] : token.email
        token.name = typeof p["name"] === "string" ? p["name"] : token.name
      }
      // Refresh access token when within 60 seconds of expiry
      const expiresAt = typeof token.expiresAt === "number" ? token.expiresAt : 0
      if (Date.now() < (expiresAt - 60) * 1000) {
        return token
      }
      // Token expired or about to expire — try to refresh
      if (!token.refreshToken) {
        return { ...token, error: "RefreshTokenMissing" }
      }
      try {
        const response = await fetch(`${internalIssuer}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: token.refreshToken as string,
            client_id: process.env.AUTH_DEX_CLIENT_ID ?? "snippeter-web",
            client_secret: process.env.AUTH_DEX_CLIENT_SECRET ?? "",
          }),
        })
        const refreshed = await response.json() as Record<string, unknown>
        if (!response.ok || refreshed["error"]) {
          return { ...token, error: "RefreshAccessTokenError" }
        }
        return {
          ...token,
          accessToken: refreshed["access_token"],
          refreshToken: refreshed["refresh_token"] ?? token.refreshToken,
          expiresAt: typeof refreshed["expires_in"] === "number"
            ? Math.floor(Date.now() / 1000) + (refreshed["expires_in"] as number)
            : expiresAt,
          error: undefined,
        }
      } catch {
        return { ...token, error: "RefreshAccessTokenError" }
      }
    },
    async session({ session, token }) {
      return {
        ...session,
        accessToken: token.accessToken as string | undefined,
        error: token.error as string | undefined,
        user: {
          ...session.user,
          sub: token.sub,
          groups: (token.groups as string[] | undefined) ?? [],
        },
      }
    },
  },
} satisfies NextAuthConfig

// next-auth beta + pnpm: TS2742 cannot name types in .pnpm deep paths.
// Cast to any to avoid the un-nameable type issue; consumers get types through next-auth's own inference.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const result = NextAuth(authConfig) as any as NextAuthResult
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handlers = result.handlers as NextAuthResult["handlers"]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth = result.auth as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const signIn = result.signIn as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const signOut = result.signOut as any
