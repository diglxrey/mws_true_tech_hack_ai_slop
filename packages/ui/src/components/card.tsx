import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground border-border flex flex-col gap-3 rounded-xl border p-4 shadow-xs",
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1", className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3 data-slot="card-title" className={cn("text-sm leading-none font-medium", className)} {...props} />
  )
}

export { Card, CardHeader, CardTitle }
