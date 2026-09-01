import Link from "next/link";

import { LogoMark } from "@/components/layout/LogoMark";
import { Button } from "@/components/ui/button";

/**
 * Landing-surface header. The app screens use `AppShell`'s top bar instead.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 w-full border-b border-border bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-control outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <LogoMark />
          <span className="text-subtitle font-semibold tracking-tight text-foreground">
            DocFlow AI
          </span>
        </Link>

        <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="lg" asChild>
            <a href="#how-it-works">How it works</a>
          </Button>
          <Button size="lg" asChild>
            <a href="#upload">Upload Document</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
