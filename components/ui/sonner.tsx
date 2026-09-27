"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/** Toasts on paper: a white card, a hairline, ink text and the soft shadow. The icon carries the meaning. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4 text-read" />
        ),
        info: (
          <InfoIcon className="size-4 text-change" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4 text-[#9a6a12]" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-ask" />
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
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast shadow-[0_1px_2px_rgb(26_26_23/0.05),0_12px_32px_-14px_rgb(26_26_23/0.22)]!",
          description: "text-muted-foreground!",
          actionButton: "bg-primary! text-primary-foreground! hover:bg-brand-hi!",
          cancelButton: "bg-secondary! text-foreground!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
