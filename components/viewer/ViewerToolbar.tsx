"use client";

/**
 * The viewer's one toolbar: `[-] 100% [+]`, `Fit`, and `< n / total >`.
 *
 * One toolbar for both source kinds. An image and a PDF differ in how they are
 * drawn, not in what the human can do to them, so the controls are identical
 * and the viewer decides what a scale or a page number means.
 *
 * Stateless by design — every value comes in as a prop and every press goes
 * straight back out. All the arithmetic lives in `./viewer-scale`.
 */

import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { canZoom, formatZoom } from "@/components/viewer/viewer-scale";
import { cn } from "@/lib/utils";

export interface ViewerToolbarProps {
  /** Current render scale; `1` is 100%. */
  scale: number;
  /** Current 1-based page. */
  page: number;
  /** Pages in the document. `1` collapses the page controls. */
  totalPages: number;
  /** Whether the current scale came from `Fit`, for the toggle's pressed state. */
  fitActive: boolean;
  onZoom: (direction: 1 | -1) => void;
  onFit: () => void;
  /** One page back (`-1`) or forward (`1`) — a step, not a destination. */
  onPageStep: (direction: 1 | -1) => void;
  /** The document's filename, shown as the toolbar's label. */
  name?: string;
  className?: string;
}

export function ViewerToolbar({
  scale,
  page,
  totalPages,
  fitActive,
  onZoom,
  onFit,
  onPageStep,
  name,
  className,
}: ViewerToolbarProps) {
  // A single-page document has nowhere to go: the arrows stay (so the toolbar
  // does not change shape between documents) but are disabled, and `1 / 1` is
  // hidden because it only ever states the obvious.
  const multiPage = totalPages > 1;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2",
        className,
      )}
    >
      {name ? (
        <p className="min-w-0 max-w-full flex-1 truncate text-label text-muted-foreground">
          {name}
        </p>
      ) : null}

      <div className="flex shrink-0 items-center gap-1.5">
        <div
          role="group"
          aria-label="Zoom"
          className="flex items-center gap-0.5 rounded-control bg-inset p-0.5"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            disabled={!canZoom(scale, -1)}
            onClick={() => onZoom(-1)}
          >
            <Minus aria-hidden />
          </Button>

          {/*
            The live scale, not a stored preset — `Fit` writes an arbitrary
            number here. Polite, so a screen reader hears the result of a press
            without the percentage interrupting anything else.
          */}
          <span
            aria-live="polite"
            className="min-w-13 text-center text-label font-medium text-foreground tabular-figures"
          >
            {formatZoom(scale)}
          </span>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={!canZoom(scale, 1)}
            onClick={() => onZoom(1)}
          >
            <Plus aria-hidden />
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          // A toggle in appearance only: pressing it again re-fits, which is
          // what a human expects after resizing the window.
          aria-pressed={fitActive}
          onClick={onFit}
          className={cn(
            "text-label",
            fitActive && "bg-inset text-foreground",
          )}
        >
          Fit
        </Button>

        <div
          role="group"
          aria-label="Page"
          className="flex items-center gap-0.5 rounded-control bg-inset p-0.5"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            disabled={!multiPage || page <= 1}
            onClick={() => onPageStep(-1)}
          >
            <ChevronLeft aria-hidden />
          </Button>

          {multiPage ? (
            <span
              aria-live="polite"
              className="min-w-13 text-center text-label font-medium text-foreground tabular-figures"
            >
              {page} / {totalPages}
              <span className="sr-only"> pages</span>
            </span>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next page"
            disabled={!multiPage || page >= totalPages}
            onClick={() => onPageStep(1)}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
