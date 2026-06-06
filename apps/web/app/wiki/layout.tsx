import type { ReactNode } from "react"
import { WikiSidebar } from "@/components/wiki/wiki-sidebar"

export default function WikiLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <WikiSidebar />
      {/* No overflow-y on main: editor page manages scroll inside the column so side panels stay viewport-sized */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
