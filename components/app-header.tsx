import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { UserMenuView } from "@/components/workspace/top-bar";
import { cn } from "@/lib/utils";

/** The account's own pages, in one order everywhere. */
const NAV = [
  { href: "/home", label: "Projects" },
  { href: "/settings#connections", label: "Connections" },
  { href: "/settings#usage", label: "Usage" },
  { href: "/settings", label: "Settings" },
] as const;

export type AppHeaderUser = { name: string; isAnonymous: boolean; avatarUrl: string | null };

/** The hand-drawn line under the current tab, the same stroke as the project's top bar. */
function PencilUnderline() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-1.5 bottom-0.5 text-brand">
      <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="block h-[5px] w-full">
        <path d="M1.5 3.8C18 2.2 38 4.6 58 3.1S88 2.7 98.5 3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

/**
 * The header on Home and Settings: the mark, the account's pages, this month's credits and the
 * account menu. On phones the pages move to their own row so nothing is hidden.
 */
export function AppHeader({ current, user, credits, cap }: { current: "/home" | "/settings"; user: AppHeaderUser; credits: number; cap: number }) {
  const used = Math.round(credits);
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/95">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 px-5 sm:px-6 md:h-14 md:flex-nowrap">
        <div className="flex h-14 items-center md:h-auto">
          <Logo href="/home" />
        </div>
        {/* The size sits on the nav: cn() would drop a text-* size token merged with a text colour. */}
        <nav aria-label="Main" className="flex items-center gap-1 text-ui font-medium max-md:order-last max-md:-mx-2.5 max-md:w-full md:ml-4">
          {NAV.map((n) => {
            const on = n.href === current;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={cn("relative inline-flex h-9 items-center px-2.5 transition-colors duration-150", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {n.label}
                {on && <PencilUnderline />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex h-14 items-center gap-3 md:h-auto">
          <span className="text-meta whitespace-nowrap tabular-nums text-muted-foreground" title="Credits used this month">
            {used} of {cap} credits<span className="max-sm:hidden"> this month</span>
          </span>
          <UserMenuView name={user.name} isAnonymous={user.isAnonymous} avatarUrl={user.avatarUrl} />
        </div>
      </div>
    </header>
  );
}
