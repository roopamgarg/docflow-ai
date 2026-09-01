"use client";

/**
 * The one component in the app allowed to import `pdfjs-dist`, and only ever to
 * *render*: it turns a page of the loaded PDF into pixels on a canvas. Reading
 * characters, words or coordinates out of a PDF is extraction and lives in
 * `lib/extraction/` — if a `getTextContent()` call ever appears in this file,
 * the layering has been broken.
 *
 * Three things here are less obvious than they look:
 *
 * 1. **The build.** `lib/extraction/**` imports `pdfjs-dist/legacy/build/pdf.mjs`
 *    because the modern build throws under Node, and that code has to run under
 *    vitest. This file only ever runs in a browser (`dynamic(..., { ssr: false })`),
 *    so it takes the modern build — which is also the build the vendored
 *    `/pdf.worker.min.mjs` comes from (`scripts/copy-assets.mjs`), so API and
 *    worker are the same code at the same version.
 *
 * 2. **Zoom goes through the viewport, not CSS.** The canvas bitmap is sized
 *    from `scale * devicePixelRatio`, so zooming in re-rasterises the page at
 *    the higher resolution and the text stays sharp. CSS-scaling one low-res
 *    bitmap would turn zoomed text to mush.
 *
 * 3. **Nothing renders into the visible canvas.** pdf.js draws into an offscreen
 *    canvas which is blitted across in one `drawImage` on success. Together with
 *    cancelling the in-flight `RenderTask` and a generation guard, that is what
 *    makes rapid zoom or page clicking impossible to tear: a superseded render
 *    is abandoned before it can touch the pixels on screen, and the previous
 *    frame stays visible (briefly CSS-stretched) until its replacement is ready
 *    rather than blanking out.
 */

import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
  RenderingCancelledException,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";

/** Page geometry reported back up to the viewer after a successful render. */
export interface PdfPageInfo {
  /** Total pages in the document — the toolbar's `n / total`. */
  numPages: number;
  /** Rendered page's natural width in CSS pixels at scale 1. */
  pageWidth: number;
  /** Rendered page's natural height in CSS pixels at scale 1. */
  pageHeight: number;
}

export interface PdfCanvasProps {
  /** Object URL of the PDF, from `doc.url` in the document context. */
  url: string;
  /** 1-based page to show. */
  page: number;
  /** Render scale; `1` is the page's natural 72 dpi size. */
  scale: number;
  /**
   * Called after each successful render with the page count and the current
   * page's natural size, which is what the viewer needs to size the sheet and
   * compute `Fit`. Must be stable (`useCallback`) — it is an effect dependency.
   */
  onPageInfo: (info: PdfPageInfo) => void;
  /** Called with a human-readable message when the document cannot be shown. */
  onError?: (message: string) => void;
}

/**
 * The vendored worker, at the site root — see `scripts/copy-assets.mjs`.
 *
 * Deliberately a local constant rather than an import from `lib/extraction/`:
 * components do not reach into the extraction layer, not even for a string.
 */
const PDF_WORKER_SRC = "/pdf.worker.min.mjs";

/** What the human is told when pdf.js cannot open or draw the file. */
const MESSAGES = {
  unreadable: "This PDF could not be opened — the file may be damaged.",
  encrypted: "This PDF is password protected, so it cannot be displayed.",
  render: "This PDF could not be displayed.",
} as const;

function messageFor(error: unknown): string {
  if (error instanceof PasswordException) return MESSAGES.encrypted;
  if (error instanceof InvalidPDFException) return MESSAGES.unreadable;
  return MESSAGES.render;
}

export function PdfCanvas({
  url,
  page,
  scale,
  onPageInfo,
  onError,
}: PdfCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);

  /** The render currently in flight, so the next one can cancel it. */
  const renderTaskRef = useRef<RenderTask | null>(null);
  /**
   * Monotonic id of the newest render pass. Cancelling is not enough on its
   * own: a pass that is still between `await`s has no task to cancel yet, so
   * every pass re-checks this after each await and abandons itself if a newer
   * one has started.
   */
  const generationRef = useRef(0);

  // Load the document once per URL. `startExtraction` hands the viewer a stable
  // object URL for the life of the document, so this does not re-run on zoom,
  // page changes or a retry of the same file.
  useEffect(() => {
    if (!GlobalWorkerOptions.workerSrc) {
      GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
    }

    let live = true;
    // Same bytes the extraction layer read, fetched from the blob URL by
    // pdf.js. `url:` (not `data:`) so the two never share a buffer — pdf.js
    // takes ownership of any ArrayBuffer it is given.
    const loadingTask = getDocument({ url, useSystemFonts: false });

    loadingTask.promise.then(
      (loaded) => {
        if (live) setPdf(loaded);
      },
      (error: unknown) => {
        // A destroyed loading task rejects on the way out; that is this
        // effect's own cleanup, not a failure worth reporting.
        if (live) onError?.(messageFor(error));
      },
    );

    return () => {
      live = false;
      setPdf(null);
      // Destroys the document proxy with it, which is what releases the worker.
      void loadingTask.destroy();
    };
  }, [url, onError]);

  // Re-render whenever the document, the page or the scale changes.
  useEffect(() => {
    if (!pdf) return;

    generationRef.current += 1;
    const generation = generationRef.current;
    const superseded = () => generationRef.current !== generation;

    const render = async () => {
      // Cancel the in-flight render and wait for it to actually stop before
      // starting another; two live render tasks corrupt each other's output.
      const inFlight = renderTaskRef.current;
      if (inFlight) {
        inFlight.cancel();
        await inFlight.promise.catch(() => undefined);
      }
      if (superseded()) return;

      const pdfPage = await pdf.getPage(page);
      if (superseded()) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const viewport = pdfPage.getViewport({ scale });
      const cssWidth = Math.floor(viewport.width);
      const cssHeight = Math.floor(viewport.height);

      // Resize the visible canvas now, before the render: the sheet and any
      // overlay on it track the new zoom immediately, and the old bitmap is
      // stretched to fill it for the frame or two until the sharp one lands.
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      // Device pixels, so a page is as sharp as the display allows at every
      // zoom level. `ceil`, as in the rasteriser: a canvas a pixel short clips
      // the page's last column.
      const output = window.devicePixelRatio || 1;
      const deviceViewport = pdfPage.getViewport({ scale: scale * output });
      const offscreen = document.createElement("canvas");
      offscreen.width = Math.ceil(deviceViewport.width);
      offscreen.height = Math.ceil(deviceViewport.height);

      const task = pdfPage.render({
        canvas: offscreen,
        viewport: deviceViewport,
      });
      renderTaskRef.current = task;

      try {
        await task.promise;
      } catch (error) {
        if (error instanceof RenderingCancelledException || superseded()) return;
        onError?.(messageFor(error));
        return;
      } finally {
        if (renderTaskRef.current === task) renderTaskRef.current = null;
      }
      if (superseded()) return;

      // One blit, so the visible canvas goes straight from the previous page to
      // the finished one with nothing partial in between.
      canvas.width = offscreen.width;
      canvas.height = offscreen.height;
      canvas.getContext("2d")?.drawImage(offscreen, 0, 0);

      onPageInfo({
        numPages: pdf.numPages,
        pageWidth: viewport.width / scale,
        pageHeight: viewport.height / scale,
      });
    };

    void render();

    return () => {
      // Bumping the generation is what actually stops a pass mid-flight; the
      // cancel just stops pdf.js doing work nobody will look at.
      generationRef.current += 1;
      renderTaskRef.current?.cancel();
    };
  }, [pdf, page, scale, onPageInfo, onError]);

  return (
    <canvas
      ref={canvasRef}
      // The canvas is the page picture, and every word on it is reported as
      // text in the extraction panel; describing it again would be noise.
      role="presentation"
      className="block"
    />
  );
}

export default PdfCanvas;
