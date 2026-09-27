import { cn } from "@/lib/utils";

/**
 * Paper has no cursor light: this is now a plain surface. The name and the `spotlight`
 * class are kept so existing callers keep working; globals.css makes the class a no-op.
 */
export function Spotlight({ children, className, as: Tag = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" | "section" }) {
  return <Tag className={cn("spotlight", className)}>{children}</Tag>;
}
