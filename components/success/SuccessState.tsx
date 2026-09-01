"use client";

/**
 * The success card: the confirmation that review is finished, the export, and
 * the way back to an empty desk.
 *
 * View layer, and it computes nothing. The payload on screen and the payload in
 * the downloaded file are the same object from `toExportJson(fields)` — one
 * mapper, so what the human reads here cannot drift from what a consumer
 * receives. Showing it inline is the point: the result of the whole pipeline is
 * visible without a trip through the filesystem.
 *
 * Three exits, in order of how likely they are to be wanted:
 * - `Export JSON` — the primary action, and why this screen exists.
 * - `View Results` — back to `/review` with state intact. A plain link, not a
 *   reset: the document, the edits and the approvals are all still there.
 * - `Process another document` — `reset()`, which drops the document and lets
 *   the route guard replace this tab with the landing page.
 */

import Link from "next/link";
import { useMemo } from "react";
import { Check, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDocument } from "@/lib/document-context";
import { downloadJson, serialiseExport, toExportJson } from "@/lib/export";
import { cn } from "@/lib/utils";

export function SuccessState({ className }: { className?: string }) {
  const { fields, reset } = useDocument();

  // Recomputed only when the review model changes — the mapping is pure, and
  // the same object feeds both the preview and the download.
  const payload = useMemo(() => toExportJson(fields), [fields]);
  const preview = useMemo(() => serialiseExport(payload), [payload]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-xl flex-col items-center gap-6 rounded-shell bg-card px-6 py-8 shadow-card ring-1 ring-border sm:px-10 sm:py-10",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          aria-hidden
          className="flex size-12 items-center justify-center rounded-4xl bg-primary text-primary-foreground"
        >
          <Check className="size-6" strokeWidth={3} />
        </span>

        <h2 className="text-title font-semibold text-foreground">
          Document approved
        </h2>
        <p className="text-body text-muted-foreground">
          All extracted fields have been reviewed.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {/*
          `asChild` so this is a real anchor: the review screen is a place, and
          it should be middle-clickable and show its URL on hover.
        */}
        <Button asChild type="button" variant="outline" size="lg">
          <Link href="/review">View Results</Link>
        </Button>

        <Button type="button" size="lg" onClick={() => downloadJson(payload)}>
          <Download aria-hidden />
          Export JSON
        </Button>
      </div>

      {/*
        The exported payload, verbatim. A `<figure>` so the caption naming it is
        tied to the block for assistive tech, and the block itself scrolls
        rather than stretching the card down a long invoice's line items.
      */}
      <figure className="flex w-full min-w-0 flex-col gap-1.5">
        <figcaption className="text-micro font-semibold uppercase text-muted-foreground">
          Export preview
        </figcaption>
        <pre className="max-h-64 min-w-0 overflow-auto rounded-card bg-inset p-3.5 text-label text-foreground tabular-figures">
          <code>{preview}</code>
        </pre>
      </figure>

      {/*
        Not a `<Link>`: the state has to be dropped before the navigation, and
        the guard on this route turns the empty state into the redirect. A link
        that skipped `reset()` would leave the finished document loaded and the
        landing page would bounce straight back here.
      */}
      <Button type="button" variant="link" size="lg" onClick={reset}>
        Process another document
      </Button>
    </div>
  );
}
