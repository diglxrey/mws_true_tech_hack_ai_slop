import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-foreground text-xs font-medium leading-none", className)}
      {...props}
    />
  )
}

export { Label }
