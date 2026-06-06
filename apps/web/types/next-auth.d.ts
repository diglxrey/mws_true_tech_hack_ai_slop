import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session extends DefaultSession {
    accessToken?: string
    error?: string
    user: DefaultSession["user"] & {
      sub?: string
      groups?: string[]
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    idToken?: string
    expiresAt?: number
    groups?: string[]
    error?: string
  }
}
