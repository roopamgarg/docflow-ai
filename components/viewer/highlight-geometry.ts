/**
 * The one piece of arithmetic behind the field highlight: a `BoundingBox` in an
 * extraction's page space turned into a CSS rectangle inside the viewer's page
 * sheet.
 *
 * Pure, and deliberately separated from `FieldHighlight` — a highlight that
 * lands a few pixels off is the most visible bug in the product, and this is the
 * only part of it that can be asserted with exact numbers rather than by eye.
 *
 * WHY THIS NEEDS TWO PAGE SIZES
 * -----------------------------
 * `BoundingBox` is documented as "page pixels at scale 1, i.e. the same space as
 * the enclosing `Page.width` / `Page.height`" — the box is only meaningful
 * *relative to the page it was measured on*, and that page is not always the
 * page the viewer draws:
 *
 * | Route                     | bbox space (`Extraction.pages`) | viewer page (`PageFrame`) | ratio |
 * |---------------------------|---------------------------------|---------------------------|-------|
 * | PDF text layer (004)      | `getViewport({ scale: 1 })`, e.g. 612x792 | the same viewport, 612x792 | 1 |
 * | Uploaded image (005)      | the image's natural pixels, e.g. 900x360 | `naturalWidth/Height`, 900x360 | 1 |
 * | Scanned PDF → OCR (005)   | the **rasterised** canvas, 2x — 1224x1584 | still 612x792 | 0.5 |
 *
 * The third row is the reason this function takes a `source` at all: OCR reports
 * boxes in the pixel space of the bitmap it was handed, and
 * `rasterisePdfPages` renders at `DEFAULT_RASTER_SCALE` (2x) so tesseract has
 * enough dpi to read small print. Assuming a single scale factor would put every
 * highlight on a scanned PDF at double size in the top-left quadrant of the
 * page. Dividing through by the source page size makes all three routes one
 * code path, which is what "source-agnostic" actually requires.
 *
 * `source` is optional because a page's geometry can be missing (`readImageSize`
 * returns `null` outside a browser, and `ocrPages` then falls back to the extent
 * of the words it found). Missing geometry degrades to a ratio of 1 rather than
 * to no highlight at all: same space is the overwhelmingly common case, and a
 * slightly loose box beats no box.
 */

import type { BoundingBox } from "@/lib/extraction/types";

/** A page's size in its own pixel space. Both spaces are described this way. */
export interface PageDimensions {
  width: number;
  height: number;
}

/** A CSS rectangle in the page sheet's coordinate space, in pixels. */
export interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Smallest rectangle worth drawing, in CSS pixels.
 *
 * A rule can settle on a box that is a hairline in one axis — a single thin
 * glyph, or a zero-height run from a source that reported no glyph height — and
 * zooming out shrinks every box further. Below a few pixels the border alone
 * fills the rect, so the floor costs nothing in accuracy and keeps the highlight
 * from vanishing at 25%.
 */
export const MIN_HIGHLIGHT_PX = 3;

/** A usable positive dimension, or `null` for anything we cannot divide by. */
function positive(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

export interface HighlightRectInput {
  /** The field's region, in the space of `source`. */
  bbox: BoundingBox;
  /**
   * Size of the page the `bbox` was measured on — `Extraction.pages[n]`.
   * `null`/omitted, or degenerate, is treated as "same space as `page`".
   */
  source?: PageDimensions | null;
  /** The viewer's page size at scale 1 — `PageFrame`'s width/height. */
  page: PageDimensions;
  /** The viewer's current render scale, e.g. `1` at 100%, `2` at 200%. */
  scale: number;
}

/**
 * Place a bounding box inside the page sheet.
 *
 * The sheet's origin is the page's top-left corner and its size is
 * `floor(page * scale)` (see `DocumentViewer`), which is the same rounding used
 * here — so a box on the page's right edge cannot land a pixel outside the
 * sheet and be clipped into invisibility.
 *
 * @returns The rectangle to draw, or `null` when there is nothing sane to draw:
 *   a page or scale of zero (the viewer has not measured yet), a missing box (a
 *   field no rule found), or a non-finite one. Callers render nothing on `null`;
 *   this never throws.
 */
export function highlightRect({
  bbox,
  source,
  page,
  scale,
}: HighlightRectInput): HighlightRect | null {
  const pageWidth = positive(page.width);
  const pageHeight = positive(page.height);
  const zoom = positive(scale);
  if (pageWidth === null || pageHeight === null || zoom === null) return null;

  // Before destructuring, not after: a missing box is one of the cases this
  // function promises to answer `null` for, and a caller that has not yet
  // narrowed a `BoundingBox | null` (every `ExtractedValue` carries one) must get
  // that answer rather than a TypeError.
  if (bbox == null) return null;

  const { x0, y0, x1, y1 } = bbox;
  if (![x0, y0, x1, y1].every((value) => Number.isFinite(value))) return null;

  // The normalisation: bbox space -> viewer page space. Both axes separately,
  // because a rasterised page's ceil() can make the two ratios differ by a
  // fraction of a pixel, and because nothing guarantees a uniform scale.
  const ratioX = pageWidth / (positive(source?.width) ?? pageWidth);
  const ratioY = pageHeight / (positive(source?.height) ?? pageHeight);

  const sheetWidth = Math.floor(pageWidth * zoom);
  const sheetHeight = Math.floor(pageHeight * zoom);

  // `min`/`max` rather than trusting x0 <= x1: the invariant is documented on
  // `BoundingBox`, and a violated one should misplace an edge, not invert the
  // box into a negative width that CSS ignores entirely.
  const left = clamp(Math.min(x0, x1) * ratioX * zoom, sheetWidth);
  const top = clamp(Math.min(y0, y1) * ratioY * zoom, sheetHeight);
  const right = clamp(Math.max(x0, x1) * ratioX * zoom, sheetWidth);
  const bottom = clamp(Math.max(y0, y1) * ratioY * zoom, sheetHeight);

  return {
    left,
    top,
    width: Math.max(right - left, MIN_HIGHLIGHT_PX),
    height: Math.max(bottom - top, MIN_HIGHLIGHT_PX),
  };
}
