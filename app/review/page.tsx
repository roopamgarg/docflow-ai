"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { ExtractionPanel } from "@/components/review/ExtractionPanel";
import {
  DocumentViewer,
  type PageUpdate,
} from "@/components/viewer/DocumentViewer";
import { FieldHighlight } from "@/components/viewer/FieldHighlight";
import { useDocument } from "@/lib/document-context";

/**
 * The review route: the document on the left, the extracted data on the right.
 *
 * Two columns from `lg` up, stacked below it with the viewer first — on a phone
 * the document is the orientation and the fields follow it, which is also the
 * DOM order, so nothing has to be reordered visually for that to be true.
 *
 * The extraction panel fills the right-hand column; it reads this page's state
 * through `useDocument()` rather than props.
 *
 * Two things live here rather than in a component below:
 *
 * 1. **The guard.** Nothing is persisted, so a hard refresh or a pasted link
 *    arrives with `doc === null`; that tab belongs on the landing page.
 *    `router.replace` runs in an effect (navigation cannot happen during render)
 *    and the early `return null` covers the frame or two before it lands, so an
 *    empty shell never flashes on the way out.
 * 2. **The visible page.** It is shared between the two columns, not private to
 *    the viewer: activating a field found on page 2 has to bring page 2 into
 *    view before the highlight can be drawn on it. The screen holding both
 *    columns is the lowest common owner, so the state sits here and the viewer
 *    is controlled.
 */
export default function ReviewPage() {
  const { doc, fields, activeFieldId } = useDocument();
  const router = useRouter();

  /**
   * The visible page, plus the two inputs it is kept in sync with.
   *
   * One state object rather than three, because the adjustments below have to
   * happen together: a page belongs to a document and to whatever field last
   * claimed it, and a stale pairing is exactly how a highlight ends up drawn on
   * the wrong page.
   */
  const [view, setView] = useState<{
    /** The document the page number belongs to. */
    url: string | null;
    /** The field the page was last moved for. */
    fieldId: string | null;
    page: number;
  }>({ url: doc?.url ?? null, fieldId: activeFieldId, page: 1 });

  const activeField =
    activeFieldId === null
      ? null
      : (fields.find((field) => field.id === activeFieldId) ?? null);
  // Only a field with a box has a page worth jumping to. A not-found field
  // leaves the viewer exactly where the human left it.
  const highlightPage = activeField?.bbox ? activeField.page + 1 : null;

  // Deriving state from a change in props, the way React documents it: adjust
  // during render, guarded by the value that triggered it, so the corrected page
  // is used by *this* render. An effect would render one frame with the old page
  // — long enough to show a highlight-less page 1 and then jump — and would trip
  // `react-hooks/set-state-in-effect` besides.
  const url = doc?.url ?? null;
  if (view.url !== url) {
    // A different document: different page count, different geometry. Back to
    // page 1, and adopt whatever field is active without moving for it.
    setView({ url, fieldId: activeFieldId, page: 1 });
  } else if (view.fieldId !== activeFieldId) {
    setView({
      url,
      fieldId: activeFieldId,
      page: highlightPage ?? view.page,
    });
  }

  /** Accepts an updater so the toolbar's arrows can step from the live page. */
  const handlePageChange = useCallback(
    (update: PageUpdate) =>
      setView((previous) => ({
        ...previous,
        page: typeof update === "function" ? update(previous.page) : update,
      })),
    [],
  );

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
          is what the panel beside it scrolls inside.
        */}
        {/*
          Keyed by the document: a different file is a different page count,
          page size and fit, and remounting is how React resets all of that
          without the viewer carrying a reset effect. The URL is stable for the
          life of one document — a retry re-reads the same bytes — so zooming
          and paging never remount.
        */}
        <DocumentViewer
          key={doc.url}
          page={view.page}
          onPageChange={handlePageChange}
          overlay={(frame) => <FieldHighlight frame={frame} />}
          className="h-100 lg:h-[70svh]"
        />

        {/*
          The same height as the viewer beside it, so the two columns line up
          and the panel's footer is pinned inside that box rather than at the
          end of however many line items the document has. Below `lg` the
          columns stack and the panel grows with its content.
        */}
        <ExtractionPanel className="lg:h-[70svh]" />
      </div>
    </AppShell>
  );
}
