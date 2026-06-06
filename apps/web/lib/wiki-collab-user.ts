import type { Session } from "next-auth"

const COLLAB_PALETTE = [
  "#e57373",
  "#f06292",
  "#ba68c8",
  "#9575cd",
  "#7986cb",
  "#64b5f6",
  "#4fc3f7",
  "#4dd0e1",
  "#4db6ac",
  "#81c784",
  "#aed581",
  "#ff8a65",
  "#d4e157",
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function collaborationColorForSeed(seed: string): string {
  return COLLAB_PALETTE[hashString(seed) % COLLAB_PALETTE.length]!
}

function displayNameFromSession(session: Session | null): string {
  if (!session?.user) return "Guest"
  const u = session.user
  if (typeof u.name === "string" && u.name.trim()) return u.name.trim()
  if (typeof u.email === "string" && u.email.includes("@")) {
    return u.email.slice(0, u.email.indexOf("@"))
  }
  if (typeof u.sub === "string" && u.sub.trim()) return u.sub.trim()
  return "Guest"
}

function stableSeed(session: Session | null): string {
  if (!session?.user) return "guest"
  const u = session.user
  if (typeof u.email === "string" && u.email) return u.email
  if (typeof u.sub === "string" && u.sub) return u.sub
  return displayNameFromSession(session)
}

/** BlockNote collaboration `user` from NextAuth session (name + stable color). */
export function getCollaborationUser(session: Session | null): { name: string; color: string } {
  const name = displayNameFromSession(session)
  const color = collaborationColorForSeed(stableSeed(session))
  return { name, color }
}

export function presenceInitials(name: string): string {
  const t = name.trim()
  if (!t) return "?"
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const a = parts[0]![0]
    const b = parts[1]![0]
    if (a && b) return (a + b).toUpperCase()
  }
  return t.slice(0, 2).toUpperCase()
}
