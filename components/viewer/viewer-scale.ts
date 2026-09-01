/**
 * The viewer's zoom arithmetic, kept out of the components that use it.
 *
 * Everything here is a pure function over numbers: no DOM, no pdf.js, no React.
 * That matters because it is the only part of ticket 012 that can be checked
 * without a browser — the canvas rendering next door cannot. `DocumentViewer`
 * owns the measuring (`ResizeObserver`, `naturalWidth`, the page viewport) and
 * hands the numbers in.
 *
 * One vocabulary throughout: a **scale** of `1` means one CSS pixel per page
 * pixel — a PDF page at its natural 72 dpi size, or an image at its natural
 * pixel size. The percentage in the toolbar is just this number times 100.
 */

/**
 * Zoom floor and ceiling.
 *
 * The floor keeps a page legible as a thumbnail rather than letting it collapse
 * to a smear; the ceiling is where a rasterised page (and the canvas memory
 * behind a PDF at 4x on a 2x display) stops being useful.
 */
export const MIN_SCALE = 0.25;
/** @see MIN_SCALE */
export const MAX_SCALE = 4;

/** One press of `[-]` or `[+]`: 25 percentage points. */
export const ZOOM_STEP = 0.25;

/**
 * Tolerance for the "which step am I on" arithmetic below.
 *
 * `Fit` produces scales like `0.7499999999999999`, and without a tolerance the
 * next `[-]` press would step from that to `0.5` — visibly skipping `0.75`.
 */
const EPSILON = 1e-6;

/** Trim binary-float noise so the toolbar never reads `74.99999%`. */
function tidy(scale: number): number {
  return Math.round(scale * 1e4) / 1e4;
}

/** Hold a scale inside `[MIN_SCALE, MAX_SCALE]`. Non-finite input falls back to `1`. */
export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return tidy(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)));
}

/**
 * The scale one `[+]` (`direction: 1`) or `[-]` (`direction: -1`) press away.
 *
 * Snaps onto the `ZOOM_STEP` grid rather than adding to the current value, so a
 * fit scale of 83% lands on a round 100% or 75% instead of carrying its
 * arbitrary fraction forever. Saturates at the bounds.
 *
 * @example steppedScale(1, 1) === 1.25
 * @example steppedScale(0.83, -1) === 0.75
 */
export function steppedScale(scale: number, direction: 1 | -1): number {
  const current = clampScale(scale) / ZOOM_STEP;
  const next =
    direction === 1
      ? Math.floor(current + EPSILON) + 1
      : Math.ceil(current - EPSILON) - 1;
  return clampScale(next * ZOOM_STEP);
}

/** Whether `[+]` / `[-]` still have somewhere to go, for the disabled state. */
export function canZoom(scale: number, direction: 1 | -1): boolean {
  return steppedScale(scale, direction) !== clampScale(scale);
}

/**
 * The scale that makes a page exactly as wide as the space available to it.
 *
 * Width only: a document is read top to bottom, so filling the width and
 * scrolling is right where fitting the whole height would shrink the text.
 *
 * @param availableWidth Content width of the scroll area, gutters already
 *   subtracted, in CSS pixels.
 * @param pageWidth The page's natural width at scale 1.
 * @returns A clamped scale, or `1` when either measurement is not usable yet
 *   (a container measured before layout, or a page whose size is unknown).
 */
export function fitScale(availableWidth: number, pageWidth: number): number {
  if (!(availableWidth > 0) || !(pageWidth > 0)) return 1;
  return clampScale(availableWidth / pageWidth);
}

/** The toolbar's zoom readout: a whole percentage. `formatZoom(0.835) === "84%"`. */
export function formatZoom(scale: number): string {
  return `${Math.round(clampScale(scale) * 100)}%`;
}

/** Keep a page number inside a document of `totalPages`. */
export function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(Math.round(page), 1), Math.max(totalPages, 1));
}
