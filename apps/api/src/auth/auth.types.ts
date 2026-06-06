export interface AuthUser {
  /** Stable subject identifier from Dex (id_token.sub). */
  sub: string
  email: string | undefined
  name: string | undefined
  /**
   * Short handle for UI (comments, etc.): OIDC `preferred_username`, else `name`,
   * else local-part of email, else `sub`.
   */
  username: string
  /** Groups / roles from the `groups` claim or mapped from Dex connector. */
  groups: string[]
}
