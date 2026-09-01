"use client";

/**
 * The review screen's right column: the heading, one card per extracted field,
 * the line items as their own group, and the progress footer pinned to the
 * bottom.
 *
 * Structure over styling: the two groups exist because a reviewer reads an
 * invoice's identity (who, when, how much) differently from its table rows, and
 * `groupReviewFields` splits them by id so the panel cannot mis-group if the
 * display mapping's order ever changes.
 *
 * Scrolling is the list's, not the panel's: the heading stays put and the
 * footer with `Approve Document` stays reachable however long the table is —
 * a reviewer must never have to scroll to the end of a hundred line items to
 * find the button. Below `lg` the column is not height-bounded, so it simply
 * grows and the footer sits at the end of it.
 *
 * Holds no state. Every value comes from `useDocument()` and every mutation
 * goes back through it.
 */

import { ExtractionField } from "@/components/review/ExtractionField";
import { groupReviewFields } from "@/components/review/field-display";
import { ReviewProgress } from "@/components/review/ReviewProgress";
import { useDocument } from "@/lib/document-context";
import { cn } from "@/lib/utils";

export function ExtractionPanel({ className }: { className?: string }) {
  const { fields } = useDocument();
  const { scalars, lineItems } = groupReviewFields(fields);

  return (
    <aside
      aria-label="Extracted data"
      className={cn("flex min-h-0 min-w-0 flex-col", className)}
    >
      <div className="flex shrink-0 items-baseline justify-between gap-3 pb-3">
        <h2 className="text-subtitle font-semibold text-foreground">
          Extracted data
        </h2>
        <span className="shrink-0 text-label text-muted-foreground tabular-figures">
          {fields.length} {fields.length === 1 ? "field" : "fields"}
        </span>
      </div>

      {/*
        `-mx-1 px-1`: the active card's accent ring sits outside its border box,
        and a scroll container would otherwise clip it against the panel edge.
      */}
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        <ul className="flex flex-col gap-2.5">
          {scalars.map((field) => (
            <ExtractionField key={field.id} field={field} />
          ))}
        </ul>

        {lineItems.length > 0 ? (
          <section className="mt-5">
            <h3 className="text-micro font-semibold uppercase text-muted-foreground">
              Line Items
            </h3>
            <ul className="mt-2.5 flex flex-col gap-2.5">
              {lineItems.map((field) => (
                <ExtractionField key={field.id} field={field} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <ReviewProgress className="mt-4 shrink-0 border-t border-border pt-4" />
    </aside>
  );
}
