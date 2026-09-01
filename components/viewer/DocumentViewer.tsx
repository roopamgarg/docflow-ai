"use client";

/**
 * The document, as the visual centre of the review screen: a warm inset well
 * holding the page as a white sheet, with one toolbar over it.
 *
 * View layer. It reads `doc` from the document context and knows nothing about
 * fields, confidence or extraction — the two source kinds differ here only in
 * how a page is drawn:
 *
 * - **image** — one page, sized from `naturalWidth`, zoomed with a CSS
 *   transform. Upscaling a photo cannot add detail, so there is nothing to gain
 *   from re-rasterising it.
 * - **pdf** — `PdfCanvas` re-renders the page at the current scale, so zoomed
 *   text is drawn sharp instead of being blown up as pixels.
 *
 * Both report their natural page size back here, which is the one number `Fit`
 * needs, and is why fitting works identically for both.
 *
 * All the arithmetic is in `./viewer-scale`; this file owns the state and the
 * measuring, which is the part that needs a browser.
 */

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import type { PdfPageInfo } from "@/components/viewer/PdfCanvas";
import { ViewerToolbar } from "@/components/viewer/ViewerToolbar";
import {
  clampPage,
  fitScale,
  steppedScale,
} from "@/components/viewer/viewer-scale";
import { useDocument } from "@/lib/document-context";
import { cn } from "@/lib/utils";

/**
 * pdf.js touches `document` and `Worker` the moment it is imported, so the
 * canvas is a browser-only island: no SSR pass, and none of pdf.js in the
 * initial bundle for the landing page.
 */
const PdfCanvas = dynamic(() => import("@/components/viewer/PdfCanvas"), {
  ssr: false,
});

/**
 * Breathing room between the sheet and the walls of the well, in CSS pixels.
 *
 * Kept as a number as well as the `p-6` class below because `Fit` has to
 * subtract it from the measured width; the two must stay in step.
 */
const PAGE_GUTTER = 24;

/** A page's natural size in CSS pixels at scale 1. */
interface PageSize {
  width: number;
  height: number;
}

/**
 * Everything an overlay drawn on top of the page needs to place itself.
 *
 * This is the seam the highlight overlay (013) uses: boxes are positioned inside
 * the sheet, whose origin is the page origin, and multiplied by `scale`. Because
 * the frame is passed on every render, an overlay tracks zoom, `Fit` and window
 * resizes without subscribing to any of them.
 */
export interface PageFrame extends PageSize {
  /** The current render scale — multiply page coordinates by this. */
  scale: number;
  /** The 1-based page on screen. */
  page: number;
}

/**
 * A page number, or a function from the current page to the next — the shape of
 * a `setState` argument, and for the same reason: the arrows step relative to
 * wherever the page is *now*, so two presses inside one React batch have to be
 * two steps rather than the same step computed twice from a stale prop.
 */
export type PageUpdate = number | ((current: number) => number);

export interface DocumentViewerProps {
  /**
   * The 1-based page to show, clamped here against the count this component
   * discovers.
   *
   * Controlled from outside rather than owned here (013): a field found on page
   * 2 has to be able to bring page 2 into view, so the visible page is shared
   * state between the two review columns and belongs to the screen holding both.
   */
  page: number;
  /** Called with the next 1-based page when the toolbar's arrows are used. */
  onPageChange: (page: PageUpdate) => void;
  /**
   * Rendered inside the page sheet, above the page, in the sheet's coordinate
   * space. @see PageFrame
   */
  overlay?: (frame: PageFrame) => ReactNode;
  className?: string;
}

export function DocumentViewer({
  page,
  onPageChange,
  overlay,
  className,
}: DocumentViewerProps) {
  const { doc } = useDocument();

  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  /**
   * The scale the human chose, or `null` while `Fit` owns it.
   *
   * `Fit` is a mode rather than a one-off press, and the fitted scale is
   * *derived* below from the live measurement instead of being copied into
   * state — so a window resize re-fits by itself, with no effect writing state
   * back and no chance of a stale number on screen.
   *
   * A document opens fitted: a letter-size page at 100% is wider than this
   * column, and a horizontal scrollbar is a poor first impression. Touching
   * `[-]` or `[+]` hands control back to the human, and from then on the viewer
   * never overrides the scale they picked.
   */
  const [manualScale, setManualScale] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Width available to the sheet, measured, gutters already removed. */
  const [availableWidth, setAvailableWidth] = useState(0);

  // Measure the well, and keep measuring: `Fit` has to be right at any window
  // size, including after the window changes size once it is on.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const measure = () => {
      setAvailableWidth(Math.max(0, element.clientWidth - PAGE_GUTTER * 2));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitted = pageSize ? fitScale(availableWidth, pageSize.width) : 1;
  const scale = manualScale ?? fitted;

  // Functional updates, so two presses in the same tick are two steps: React
  // batches them, and a callback reading `scale` out of the render closure
  // would compute the same next value twice.
  const handleZoom = useCallback(
    (direction: 1 | -1) =>
      setManualScale((previous) => steppedScale(previous ?? fitted, direction)),
    [fitted],
  );

  const handleFit = useCallback(() => setManualScale(null), []);

  // A step rather than a destination, for the same batching reason, and clamped
  // here against the count we know rather than in the parent, which does not
  // know it: the page is the parent's state but the page *count* is discovered
  // by this component.
  const handlePageStep = useCallback(
    (direction: 1 | -1) =>
      onPageChange((current) => clampPage(current + direction, totalPages)),
    [onPageChange, totalPages],
  );

  /**
   * Stable, because `PdfCanvas` takes it as an effect dependency: a new
   * function identity on every render would reload the PDF on every render.
   * Both setters compare before writing, so a re-render reporting the same
   * geometry does not loop back through the fit effect.
   */
  const handlePageInfo = useCallback((info: PdfPageInfo) => {
    setTotalPages((previous) =>
      previous === info.numPages ? previous : info.numPages,
    );
    setPageSize((previous) =>
      previous &&
      previous.width === info.pageWidth &&
      previous.height === info.pageHeight
        ? previous
        : { width: info.pageWidth, height: info.pageHeight },
    );
  }, []);

  const handleError = useCallback((message: string) => setError(message), []);

  const handleImageLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = event.currentTarget;
      handlePageInfo({
        numPages: 1,
        pageWidth: naturalWidth,
        pageHeight: naturalHeight,
      });
    },
    [handlePageInfo],
  );

  // Rendered by `/review`, which guards on the document — but the sheet has
  // nothing to show without one, so it says so in types too.
  if (!doc) return null;

  // Clamped for display without being written back to the parent: the count is
  // only known after the first page loads, so a `page` of 2 arriving before the
  // document reports 3 pages must not be corrected to 1 and lost.
  const safePage = clampPage(page, totalPages);
  // Until the first page reports its size there is nothing to lay out. The
  // sheet is mounted (the canvas has to be in the DOM to render into) but held
  // invisible, so the well never flashes an empty 300x150 rectangle.
  const ready = pageSize !== null;
  const sheetStyle = pageSize
    ? {
        width: Math.floor(pageSize.width * scale),
        height: Math.floor(pageSize.height * scale),
      }
    : undefined;

  return (
    <section
      aria-label="Document"
      className={cn("flex min-h-0 min-w-0 flex-col gap-3", className)}
    >
      <ViewerToolbar
        name={doc.name}
        scale={scale}
        page={safePage}
        totalPages={totalPages}
        fitActive={manualScale === null}
        onZoom={handleZoom}
        onFit={handleFit}
        onPageStep={handlePageStep}
      />

      {/* The well: recessed, warm, and the only thing that scrolls. */}
      <div
        ref={scrollRef}
        aria-busy={!ready && !error}
        className="min-h-0 flex-1 overflow-auto rounded-card bg-inset"
      >
        {error ? (
          <div className="flex h-full min-h-40 items-center justify-center p-6">
            <p role="alert" className="text-body text-muted-foreground">
              {error}
            </p>
          </div>
        ) : (
          <div className="flex min-h-full w-fit min-w-full items-start justify-center p-6">
            <div
              // The page sheet. `relative`, because it is the coordinate space
              // every overlay on the page is positioned in. @see PageFrame
              data-page-sheet=""
              style={sheetStyle}
              className={cn(
                "relative shrink-0 overflow-hidden bg-surface shadow-sheet transition-opacity",
                ready ? "opacity-100" : "opacity-0",
              )}
            >
              {doc.kind === "pdf" ? (
                <PdfCanvas
                  url={doc.url}
                  page={safePage}
                  scale={scale}
                  onPageInfo={handlePageInfo}
                  onError={handleError}
                />
              ) : (
                /*
                  A blob URL for a local file: there is nothing for `next/image`
                  to optimise, its loader cannot fetch it, and the intrinsic size
                  is only known once it decodes.
                */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={doc.url}
                  alt=""
                  onLoad={handleImageLoad}
                  onError={() =>
                    handleError("This image could not be displayed.")
                  }
                  // Natural size, then scaled from the top-left corner so the
                  // sheet's origin stays the page's origin at every zoom.
                  style={
                    pageSize
                      ? {
                          width: pageSize.width,
                          height: pageSize.height,
                          transform: `scale(${scale})`,
                          transformOrigin: "top left",
                        }
                      : undefined
                  }
                  className="block max-w-none"
                />
              )}

              {/*
                Overlay slot — the highlight overlay (013) mounts here, inside
                the sheet, so its boxes share the page's origin.
              */}
              {ready && overlay
                ? overlay({ ...pageSize, scale, page: safePage })
                : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
