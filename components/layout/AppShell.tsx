import type { ReactNode } from "react";

import { IconRail } from "@/components/layout/IconRail";

type AppShellProps = {
  /** Rendered as the page heading in the top bar. */
  title: ReactNode;
  /** Optional trailing slot of the top bar — typically one primary action. */
  action?: ReactNode;
  children: ReactNode;
};

/**
 * The application chrome: a cream page holding one floating white card with the
 * icon rail and a top bar. Pages own their own `title` / `action` content, so
 * the shell never reads route state.
 */
export function AppShell({ title, action, children }: AppShellProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas p-3 sm:p-5 lg:p-8">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden rounded-shell bg-surface shadow-shell lg:flex-row">
        <IconRail />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 lg:px-8">
            <h1 className="text-title font-semibold text-foreground">
              {title}
            </h1>
            {action ? (
              <div className="flex shrink-0 items-center gap-2">{action}</div>
            ) : null}
          </div>

          <main className="min-w-0 flex-1 px-5 py-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
