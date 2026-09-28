import * as React from "react"
import { cn } from "@/lib/utils"

/** One look for every field: a control-sized box on paper (rounded-md), a line-strong hover, the brand focus ring. */
const FIELD =
  "w-full min-w-0 rounded-md border border-input bg-raised text-body text-foreground transition-[border-color,box-shadow] duration-150 ease-paper outline-none placeholder:text-muted-foreground/75 hover:border-line-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        FIELD,
        "h-8 px-2.5 py-1 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-ui file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

/** A native list for longer choices (five or more), drawn like the inputs. Two to four options use Segmented. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select data-slot="native-select" className={cn(FIELD, "h-8 px-2 text-ui", className)} {...props} />
}

export { Input, NativeSelect }
