import { Geist, Geist_Mono } from "next/font/google"
import { SessionProvider } from "next-auth/react"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthHeader } from "@/components/auth-header"
import { cn } from "@workspace/ui/lib/utils"

const geist = Geist({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", geist.variable)}
    >
      <body className="flex h-screen min-h-0 flex-col overflow-hidden">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SessionProvider>
            <ThemeProvider>
              <AuthHeader />
              {/* Fill viewport below header so wiki/editor side panels stay on screen */}
              <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            </ThemeProvider>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
