"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/**
 * Toasts are a floating layer on paper: a white card, a hairline, ink text and the float shadow. The icon carries
 * the meaning: success is the ok green; info, warnings and errors stay ink (rose is only for what can't be undone).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4 text-ok" />
        ),
        info: (
          <InfoIcon className="size-4 text-muted-foreground" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4 text-foreground" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-foreground" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--raised)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--hairline-hi)",
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast shadow-float! text-ui!",
          description: "text-muted-foreground! text-meta!",
          actionButton: "bg-primary! text-primary-foreground! hover:bg-brand-hi!",
          cancelButton: "bg-secondary! text-foreground!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
