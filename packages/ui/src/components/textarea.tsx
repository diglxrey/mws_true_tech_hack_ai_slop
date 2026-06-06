import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-background selection:bg-primary selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground flex min-h-24 w-full rounded-lg border px-2.5 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
