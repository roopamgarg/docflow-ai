/**
 * The PDF text-layer source: reads the characters a digital PDF already carries
 * and normalises them into the shared `Page` / `Word` model.
 *
 * Two halves, deliberately separated:
 *
 * 1. **Pure geometry** — `pdfPointToPagePixel`, `textItemBoundingBox` and
 *    `textItemToWords` take plain numbers and return plain data. They are the
 *    risky part of this module (a coordinate-space mistake here shows up much
 *    later as vertically mirrored highlights), so they are unit-testable
 *    without loading a PDF.
 * 2. **I/O** — `extractPdfText` drives pdf.js and delegates every coordinate to
 *    the functions above.
 *
 * This module does NOT decide whether the text layer is good enough to use.
 * A scanned PDF has a page structure and zero characters; detecting that and
 * falling back to OCR is ticket 008's job, which is why the per-page
 * `charCount` is part of the returned shape rather than a threshold applied here.
 */

// The legacy build, not the default one: pdf.js's modern build relies on
// JS features Node does not have yet (it warns "Please use the `legacy` build
// in Node.js environments" and then throws), and the same code path has to run
// in the browser and under vitest's node environment. Both builds ship the same
// API at the same version, so the vendored `pdf.worker.min.mjs` still matches.
import {
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
} from "pdfjs-dist/legacy/build/pdf.mjs";

import { ExtractionError, isExtractionError } from "../../errors";
import type { BoundingBox, DocumentText, Page, Word } from "../../types";

/**
 * Confidence reported for every word from this source.
 *
 * Exactly `1`: the characters are not guessed, they are read out of the file.
 * Uncertainty about what a value *means* is a separate axis, carried by
 * `MatchStrength` in `../../confidence` and composed in 006/007.
 */
export const PDF_TEXT_CONFIDENCE = 1;

/**
 * Where the vendored pdf.js worker lives, relative to the site root — see
 * `scripts/copy-assets.mjs`. Used in the browser only; under Node there is no
 * `Worker`, so pdf.js parses on the calling thread instead.
 */
export const DEFAULT_PDF_WORKER_SRC = "/pdf.worker.min.mjs";

/**
 * The part of a `PageViewport` the geometry functions need: the matrix that
 * maps PDF user space onto the page's pixel space, plus the page's size in that
 * space. Taken from `page.getViewport({ scale: 1 })` rather than rebuilt, so
 * page rotation, a non-zero `MediaBox` origin and `/UserUnit` are all already
 * accounted for.
 */
export interface PdfViewportGeometry {
  /** `PageViewport.transform`: `[a, b, c, d, e, f]`. */
  transform: readonly number[];
  /** Page width in pixels at scale 1. */
  width: number;
  /** Page height in pixels at scale 1. */
  height: number;
}

/**
 * The fields this module uses from a pdf.js `TextItem`, restated as plain data
 * so tests can build one by hand.
 *
 * All three are in PDF user space (origin bottom-left, y growing up):
 * - `transform` is the text rendering matrix; `[4]` and `[5]` are the origin of
 *   the run's **baseline**, and `[0..3]` carry the glyph scale and rotation.
 * - `width` is the run's total advance along the text direction.
 * - `height` is the glyph height, i.e. `hypot(transform[2], transform[3])` for
 *   horizontal text.
 */
export interface PdfTextItemMetrics {
  str: string;
  transform: readonly number[];
  width: number;
  height: number;
}

/** A `Page` plus the emptiness signal ticket 008 needs to spot a scanned PDF. */
export interface PdfTextPage extends Page {
  /**
   * Non-whitespace characters in this page's embedded text layer.
   *
   * Counted before word splitting and excluding whitespace on purpose: a
   * scanned page often still has a text layer made of nothing but spaces and
   * line breaks, and that carries no information, so it must read as `0`.
   */
  charCount: number;
}

/** `DocumentText` from this source, with the per-page character counts kept. */
export interface PdfTextDocument extends DocumentText {
  source: "pdf-text";
  pages: PdfTextPage[];
}

/** Options for `extractPdfText`. Both exist so tests and Node can opt out. */
export interface PdfTextOptions {
  /**
   * Overrides `GlobalWorkerOptions.workerSrc`. Left alone by default outside
   * the browser; in the browser `DEFAULT_PDF_WORKER_SRC` is applied unless
   * something (e.g. the preview canvas) already set it.
   */
  workerSrc?: string;
  /**
   * Directory of the vendored standard-font data, with a trailing slash. Only
   * affects rendering of the 14 built-in fonts; text extraction works without
   * it, at the cost of one pdf.js warning.
   */
  standardFontDataUrl?: string;
}

/**
 * Map a point from PDF user space into top-left page-pixel space.
 *
 * This is the whole coordinate conversion, and it is a single application of
 * the viewport matrix — the same `Util.applyTransform` pdf.js uses internally.
 * Deriving it from `viewport.transform` rather than flipping `y` by hand is
 * what makes rotated pages and offset media boxes come out right: for an
 * upright US-Letter page the matrix is `[1, 0, 0, -1, 0, 792]`, so PDF
 * `y = 700` lands at pixel `y = 92`, measured down from the top.
 *
 * @returns `[x, y]` in the space documented on `BoundingBox`.
 */
export function pdfPointToPagePixel(
  x: number,
  y: number,
  viewportTransform: readonly number[]
): [x: number, y: number] {
  const [a, b, c, d, e, f] = viewportTransform;
  return [x * a + y * c + e, x * b + y * d + f];
}

/** Clamp to `0..max`, so a box is never placed off the page it belongs to. */
function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

/**
 * Convert one pdf.js text run into a top-left page-pixel `BoundingBox`.
 *
 * The run's em-box is built in PDF user space from the baseline origin: `width`
 * along the text direction, `height` up along the ascender direction. All four
 * corners are then mapped through the viewport matrix and reduced to an
 * axis-aligned box, which keeps `x0 <= x1` / `y0 <= y1` true for any rotation
 * without special-casing one.
 *
 * The box sits entirely above the baseline, so descenders (the tail of a `g`)
 * can reach a couple of pixels below `y1`. That matches the run's em-box and
 * keeps the conversion free of font metrics; highlights are drawn from these
 * boxes, not glyph outlines.
 *
 * Worked example — `transform: [12, 0, 0, 12, 72, 700]`, `width: 92.04`,
 * `height: 12` on a 612x792 page (`viewport.transform [1, 0, 0, -1, 0, 792]`)
 * gives `{ x0: 72, y0: 80, x1: 164.04, y1: 92 }`.
 */
export function textItemBoundingBox(
  item: Pick<PdfTextItemMetrics, "transform" | "width" | "height">,
  viewport: PdfViewportGeometry
): BoundingBox {
  const [a, b, c, d, originX, originY] = item.transform;

  // Unit vectors of the run's own axes, in PDF user space.
  const advanceLength = Math.hypot(a, b);
  const ascenderLength = Math.hypot(c, d);
  const advanceX = advanceLength === 0 ? 1 : a / advanceLength;
  const advanceY = advanceLength === 0 ? 0 : b / advanceLength;
  const ascenderX = ascenderLength === 0 ? 0 : c / ascenderLength;
  const ascenderY = ascenderLength === 0 ? 1 : d / ascenderLength;

  // Vertical writing modes report the accumulated extent in the other field,
  // so fall back to the glyph scale rather than collapsing the box to a line.
  const runWidth = item.width || advanceLength;
  const runHeight = item.height || ascenderLength;

  const corners: [number, number][] = [
    [originX, originY],
    [originX + advanceX * runWidth, originY + advanceY * runWidth],
    [originX + ascenderX * runHeight, originY + ascenderY * runHeight],
    [
      originX + advanceX * runWidth + ascenderX * runHeight,
      originY + advanceY * runWidth + ascenderY * runHeight,
    ],
  ];

  const xs: number[] = [];
  const ys: number[] = [];
  for (const [cornerX, cornerY] of corners) {
    const [pixelX, pixelY] = pdfPointToPagePixel(
      cornerX,
      cornerY,
      viewport.transform
    );
    xs.push(pixelX);
    ys.push(pixelY);
  }

  return {
    x0: clamp(Math.min(...xs), viewport.width),
    y0: clamp(Math.min(...ys), viewport.height),
    x1: clamp(Math.max(...xs), viewport.width),
    y1: clamp(Math.max(...ys), viewport.height),
  };
}

/** `[startIndex, endIndex)` of every whitespace-delimited token in `text`. */
function tokenRanges(text: string): [start: number, end: number][] {
  const ranges: [number, number][] = [];
  const matcher = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

/**
 * Split one pdf.js text run into `Word`s.
 *
 * pdf.js hands back runs, not words — a run is usually a whole line. Each
 * whitespace-delimited token therefore gets its slice of the run's advance
 * width, apportioned by character offset. That is exact for a single-word run
 * and an even split within a run, which is close enough to place a highlight;
 * the alternative would be re-measuring glyph advances, i.e. re-implementing
 * the font engine.
 *
 * Runs with no non-whitespace characters produce no words. pdf.js emits a few
 * of those per page (an empty run at every font change), and an invisible word
 * would otherwise become a match candidate for the rule engine.
 */
export function textItemToWords(
  item: PdfTextItemMetrics,
  viewport: PdfViewportGeometry,
  pageIndex: number
): Word[] {
  const characterCount = item.str.length;
  if (characterCount === 0) return [];

  const [a, b, c, d, originX, originY] = item.transform;
  const advanceLength = Math.hypot(a, b);
  const advanceX = advanceLength === 0 ? 1 : a / advanceLength;
  const advanceY = advanceLength === 0 ? 0 : b / advanceLength;
  const runWidth = item.width || advanceLength;

  return tokenRanges(item.str).map(([start, end]) => {
    const offset = (runWidth * start) / characterCount;
    const tokenWidth = (runWidth * (end - start)) / characterCount;

    return {
      text: item.str.slice(start, end),
      confidence: PDF_TEXT_CONFIDENCE,
      bbox: textItemBoundingBox(
        {
          transform: [
            a,
            b,
            c,
            d,
            originX + advanceX * offset,
            originY + advanceY * offset,
          ],
          width: tokenWidth,
          height: item.height,
        },
        viewport
      ),
      page: pageIndex,
    };
  });
}

/**
 * The emptiness signal ticket 008 reads: non-whitespace characters across a
 * page's text runs. A text-bearing page returns a few hundred; a scanned,
 * image-only page returns `0`.
 */
export function countTextLayerCharacters(
  strings: readonly string[]
): number {
  let total = 0;
  for (const value of strings) {
    total += value.replace(/\s+/g, "").length;
  }
  return total;
}

/** Total non-whitespace characters across every page of a result. */
export function totalCharCount(document: PdfTextDocument): number {
  return document.pages.reduce((sum, page) => sum + page.charCount, 0);
}

/** Point pdf.js at the vendored worker, without stomping on an existing choice. */
function configureWorker(workerSrc: PdfTextOptions["workerSrc"]): void {
  if (workerSrc) {
    GlobalWorkerOptions.workerSrc = workerSrc;
    return;
  }
  // Under Node there is no `Worker`; pdf.js falls back to parsing inline, which
  // is what the unit tests rely on. Only the browser needs a worker URL.
  if (typeof window !== "undefined" && !GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = DEFAULT_PDF_WORKER_SRC;
  }
}

/**
 * pdf.js mixes marked-content markers into `items`; only real text runs carry
 * `str`. Generic so the narrowed type stays a subtype of what `filter` was
 * given, which is what lets TypeScript accept it as a type predicate there.
 */
function isTextItem<T>(item: T): item is T & PdfTextItemMetrics {
  return typeof (item as { str?: unknown }).str === "string";
}

/**
 * Read a PDF's embedded text layer into pages of words.
 *
 * Returns whatever the text layer holds, including nothing at all: an empty
 * `words` array with `charCount: 0` is a valid, informative result — it is
 * exactly how a scanned document looks — so this never throws `no_text_found`.
 * Choosing OCR instead is ticket 008's decision.
 *
 * @param bytes The PDF file's bytes. Copied before use, because pdf.js takes
 *   ownership of the buffer it is handed and the same file is re-read later for
 *   the preview canvas.
 * @throws {ExtractionError} `unreadable` when the bytes are not a PDF we can
 *   open (damaged, or password protected); `internal` for anything else.
 */
export async function extractPdfText(
  bytes: ArrayBuffer | Uint8Array,
  options: PdfTextOptions = {}
): Promise<PdfTextDocument> {
  configureWorker(options.workerSrc);

  const data =
    bytes instanceof Uint8Array
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.slice(0));

  const loadingTask = getDocument({
    data,
    // Never reach past the file: no remote cMap or font URLs are configured,
    // and local font substitution stays off so the same bytes always parse the
    // same way whatever machine this runs on.
    useSystemFonts: false,
    standardFontDataUrl: options.standardFontDataUrl,
  });

  try {
    const pdf = await loadingTask.promise;
    const pages: PdfTextPage[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const pageIndex = pageNumber - 1;
      const page = await pdf.getPage(pageNumber);

      // Scale 1 is the contract: `Page.width` / `Page.height` and every
      // `bbox` share this space, and consumers scale to their own zoom.
      const viewport = page.getViewport({ scale: 1 });
      const geometry: PdfViewportGeometry = {
        transform: viewport.transform,
        width: viewport.width,
        height: viewport.height,
      };

      const textContent = await page.getTextContent();
      const items = textContent.items.filter(isTextItem);

      pages.push({
        index: pageIndex,
        width: geometry.width,
        height: geometry.height,
        words: items.flatMap((item) =>
          textItemToWords(item, geometry, pageIndex)
        ),
        charCount: countTextLayerCharacters(items.map((item) => item.str)),
      });
    }

    return { pages, source: "pdf-text" };
  } catch (error) {
    if (isExtractionError(error)) throw error;
    if (
      error instanceof InvalidPDFException ||
      error instanceof PasswordException
    ) {
      throw new ExtractionError("unreadable", undefined, { cause: error });
    }
    throw new ExtractionError("internal", undefined, { cause: error });
  } finally {
    await loadingTask.destroy();
  }
}
