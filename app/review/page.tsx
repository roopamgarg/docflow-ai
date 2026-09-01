"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { DocumentViewer } from "@/components/viewer/DocumentViewer";
import { useDocument } from "@/lib/document-context";

/**
 * The review route: the document on the left, the extracted data on the right.
 *
 * Two columns from `lg` up, stacked below it with the viewer first — on a phone
 * the document is the orientation and the fields follow it, which is also the
 * DOM order, so nothing has to be reordered visually for that to be true.
 *
 * The highlight overlay (013) and the extraction panel (014) fill in from here;
 * both read this page's state through `useDocument()` rather than props.
 *
 * The guard is the other point of this file. Nothing is persisted, so a hard
 * refresh or a pasted link arrives with `doc === null`; that tab belongs on the
 * landing page. `router.replace` runs in an effect (navigation cannot happen
 * during render) and the early `return null` covers the frame or two before it
 * lands, so an empty shell never flashes on the way out.
 */
export default function ReviewPage() {
  const { doc } = useDocument();
  const router = useRouter();

  useEffect(() => {
    if (!doc) router.replace("/");
  }, [doc, router]);

  if (!doc) return null;

  return (
    <AppShell title="Review extraction">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/*
          The viewer is given an explicit height rather than being left to grow
          with the page it holds: the document scrolls inside its own well, so
          the toolbar stays put and zooming to 400% does not turn the whole
          screen into a scroll area. That height also sets the grid row, which
          is what the panel beside it (014) will scroll inside.
        */}
        {/*
          Keyed by the document: a different file is a different page count,
          page size and fit, and remounting is how React resets all of that
          without the viewer carrying a reset effect. The URL is stable for the
          life of one document — a retry re-reads the same bytes — so zooming
          and paging never remount.
        */}
        <DocumentViewer key={doc.url} className="h-100 lg:h-[70svh]" />

        {/* Placeholder slot for the extraction panel (014). */}
        <aside
          aria-label="Extracted data"
          className="flex min-h-0 min-w-0 flex-col rounded-card bg-card p-5 shadow-card"
        >
          <h2 className="text-subtitle font-semibold text-foreground">
            Extracted data
          </h2>
          <p className="mt-2 text-body text-muted-foreground">
            The field cards, inline editing and approval controls arrive with
            ticket 014.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
