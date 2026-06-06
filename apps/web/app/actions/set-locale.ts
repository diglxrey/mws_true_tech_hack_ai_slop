"use server"

import { cookies } from "next/headers"
import { LOCALE_COOKIE, SUPPORTED_LOCALES, type Locale } from "@/i18n/request"

export async function setLocale(locale: Locale) {
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) return
  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365 })
}
