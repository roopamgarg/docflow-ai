"use client";

/**
 * The link between the two review columns, drawn: the active field's source
 * region, boxed on the page it was read from.
 *
 * View layer, and stateless. It reads `activeFieldId`, `fields` and the
 * extraction's page geometry from the document context, and it owns exactly one
 * decision — whether there is a box to draw — while `./highlight-geometry` owns
 * where. Nothing here reaches into `lib/extraction` beyond its types: the
 * geometry a highlight needs is already on `ExtractedField`.
 *
 * Mounted through `DocumentViewer`'s `overlay` render prop, so it is positioned
 * inside the page sheet and shares the page's origin. That is what makes it
 * track zoom, `Fit` and window resizes without observing any of them: the sheet
 * is `floor(pageSize * scale)` and the frame reports the same numbers, so the
 * box is recomputed by the same render that resizes the sheet.
 *
 * It renders nothing — never an empty box, never an error — when no field is
 * active, when the active field was not found (no `bbox`), or when the field
 * lives on a page other than the one on screen. The page *switch* for that last
 * case is not this component's job: `/review` owns the visible page and points
 * the viewer at the active field's page, and this component simply becomes
 * visible once the frame catches up.
 */

import type { PageFrame } from "@/components/viewer/DocumentViewer";
import { highlightRect } from "@/components/viewer/highlight-geometry";
import { useDocument } from "@/lib/document-context";

export interface FieldHighlightProps {
  /** The page frame from `DocumentViewer`'s overlay slot. @see PageFrame */
  frame: PageFrame;
}

export function FieldHighlight({ frame }: FieldHighlightProps) {
  const { fields, activeFieldId, pages } = useDocument();

  if (activeFieldId === null) return null;

  const field = fields.find((candidate) => candidate.id === activeFieldId);
  // A field with no box is a found-nothing field, which is a designed state
  // rather than a failure: the panel says so in words, and the document stays
  // clean instead of pointing at a region that means nothing.
  if (!field || !field.bbox) return null;

  // `ExtractedValue.page` is zero-based; the viewer's is the human's 1-based
  // page number.
  if (field.page + 1 !== frame.page) return null;

  const rect = highlightRect({
    bbox: field.bbox,
    // The page the box was measured on, which is not always the page being
    // drawn — see `./highlight-geometry` for why (rasterised scans are 2x).
    source: pages?.find((page) => page.index === field.page) ?? null,
    page: frame,
    scale: frame.scale,
  });
  if (rect === null) return null;

  return (
    <div
      // The sheet is the coordinate space; this layer only exists to keep the
      // box out of the way of the page. `aria-hidden`, because the field card is
      // the accessible representation of this information — a screen reader
      // gains nothing from an unlabelled rectangle.
      aria-hidden
      className="pointer-events-none absolute inset-0"
    >
      <div
        data-field-highlight={field.id}
        style={rect}
        // Translucent fill so the words underneath stay readable, solid border
        // so the exact region stays legible even on a dark stamp or a photo.
        // `border-box` (Tailwind's preflight) puts the border's outer edge on
        // the bbox rather than a pixel outside it.
        className="absolute border border-primary bg-primary/15"
      />
    </div>
  );
}
