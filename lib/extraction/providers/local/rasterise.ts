/**
 * The scanned-PDF bridge: renders each page of a PDF to a canvas so the OCR
 * source has something to recognise.
 *
 * This is the one genuinely browser-only module in the extraction layer — it
 * needs a real `<canvas>` — so it is kept behind the injection seam on
 * `createLocalProvider` rather than called inline. Under Node (and therefore
 * under vitest's node environment) there is no `document`, so it throws a
 * documented `internal` error instead of crashing on an undefined global; tests
 * for route selection inject a stub and never reach this code.
 *
 * Rendering, not extraction: no coordinate conversion happens here. OCR reports
 * boxes in the pixel space of the canvas it was handed, which is why each page's
 * rasterised `width` / `height` are returned alongside it — at `scale: 2` a page
 * is 2x, its words are 2x, and the two stay consistent, which is all
 * `BoundingBox` requires.
 */

// The legacy build, matching `./pdf-text` — the modern build throws under Node,
// and both ship the same API against the same vendored worker.
import {
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
} from "pdfjs-dist/legacy/build/pdf.mjs";

import { ExtractionError, isExtractionError } from "../../errors";
import type { OcrPageInput } from "./ocr";
import { DEFAULT_PDF_WORKER_SRC } from "./pdf-text";

/**
 * Render scale for OCR.
 *
 * A PDF page at scale 1 is ~72 dpi, and tesseract reads that badly: small print
 * turns into noise. 2x lands around 150 dpi, which is the usual floor for
 * reliable recognition, without the memory cost of 3x on a multi-page scan.
 */
export const DEFAULT_RASTER_SCALE = 2;

/** Options for `rasterisePdfPages`. */
export interface RasterisePdfOptions {
  /** @see DEFAULT_RASTER_SCALE */
  scale?: number;
  /** Overrides `GlobalWorkerOptions.workerSrc`; see `./pdf-text`. */
  workerSrc?: string;
  /** Called after each page is rendered, for progress reporting. */
  onPage?: (rendered: number, total: number) => void;
}

/** The seam `createLocalProvider` injects. @see rasterisePdfPages */
export type PdfRasteriser = (
  bytes: ArrayBuffer | Uint8Array,
  options?: RasterisePdfOptions
) => Promise<OcrPageInput[]>;

/** Point pdf.js at the vendored worker, without stomping on an existing choice. */
function configureWorker(workerSrc: string | undefined): void {
  if (workerSrc) {
    GlobalWorkerOptions.workerSrc = workerSrc;
    return;
  }
  if (typeof window !== "undefined" && !GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = DEFAULT_PDF_WORKER_SRC;
  }
}

/**
 * A blank canvas of the given pixel size.
 *
 * `HTMLCanvasElement` specifically: pdf.js 6 types `RenderParameters.canvas` as
 * one, and it is the source tesseract.js handles most predictably.
 */
function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new ExtractionError(
      "internal",
      "Reading a scanned PDF needs a browser canvas.",
      { cause: new Error("rasterisePdfPages requires a DOM") }
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Render every page of a PDF into an OCR input.
 *
 * @param bytes The PDF file's bytes. Copied before use: pdf.js takes ownership
 *   of the buffer it is handed, and the caller already read the same bytes for
 *   the text-layer attempt.
 * @throws {ExtractionError} `unreadable` when the bytes are not a PDF we can
 *   open; `internal` when there is no canvas to render into.
 */
export const rasterisePdfPages: PdfRasteriser = async (bytes, options = {}) => {
  const { scale = DEFAULT_RASTER_SCALE, workerSrc, onPage } = options;

  configureWorker(workerSrc);

  const data =
    bytes instanceof Uint8Array
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.slice(0));

  const loadingTask = getDocument({ data, useSystemFonts: false });

  try {
    const pdf = await loadingTask.promise;
    const inputs: OcrPageInput[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      // Ceil, not round: a canvas one pixel short would clip the page's last
      // column of glyphs, and a clipped glyph is a misread word.
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height)
      );

      try {
        await page.render({ canvas, viewport }).promise;
      } finally {
        // Release the page's operator list before the next one is parsed; a
        // 20-page scan otherwise holds every page's render data at once.
        page.cleanup();
      }

      inputs.push({
        source: canvas,
        width: canvas.width,
        height: canvas.height,
      });

      onPage?.(pageNumber, pdf.numPages);
    }

    return inputs;
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
};
