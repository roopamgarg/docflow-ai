"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Home } from "lucide-react";

import { LogoMark } from "@/components/layout/LogoMark";
import { cn } from "@/lib/utils";

/** Exactly two destinations, plus the logo. The rail never grows past this. */
const RAIL_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/review", label: "Document", icon: FileText },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * The slim navigation rail of `AppShell`. Vertical on the left from `lg` up,
 * collapsed to a row along the top edge below it.
 */
export function IconRail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 lg:w-16 lg:flex-col lg:gap-3 lg:border-r lg:border-b-0 lg:px-0 lg:py-5"
    >
      <Link
        href="/"
        className="mr-1 rounded-control outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:mr-0 lg:mb-2"
      >
        <LogoMark />
        <span className="sr-only">DocFlow AI home</span>
      </Link>

      {RAIL_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex size-9 items-center justify-center rounded-control outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-5" />
            <span className="sr-only">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
