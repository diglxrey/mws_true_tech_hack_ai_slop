import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"

export const LOCALE_COOKIE = "NEXT_LOCALE"
export const SUPPORTED_LOCALES = ["en", "ru"] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const raw = cookieStore.get(LOCALE_COOKIE)?.value ?? DEFAULT_LOCALE
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(raw) ? raw : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
