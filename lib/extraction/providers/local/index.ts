/**
 * The local extraction provider: the orchestrator that turns an uploaded file
 * into an `Extraction`, entirely on the user's machine.
 *
 * This is the only module that knows both sources exist, and the only one that
 * decides between them. Everything above it sees `extract(file, onProgress)`.
 *
 * The pipeline, in order:
 *
 * 1. **Validate** (`validateFile`) — media type and size, before a single byte
 *    is parsed. Rejecting a 40 MB TIFF after starting a WASM worker would be
 *    slow and would surface as the wrong error.
 * 2. **Route** (`extract`) — PNG/JPEG go straight to OCR. A PDF is read for its
 *    text layer first, and falls back to rasterise-then-OCR when that layer is
 *    too sparse to be real text (`isTextLayerUsable`). Scanned PDFs are common
 *    enough that skipping the fallback would make the app feel broken.
 * 3. **Match** (`assembleExtraction`) — the scalar matchers plus the line-item
 *    extractor, with each field's confidence composed from the words behind it.
 *
 * Every source and side effect is injectable (see `LocalProviderDeps`), mirroring
 * the `createWorker` seam in `./ocr`: route selection, validation, progress and
 * not-found mapping are then testable without OCR, without a real PDF and
 * without a DOM.
 */

import { composeConfidence } from "../../confidence";
import { ExtractionError } from "../../errors";
import type {
  ExtractionPhase,
  ExtractionProgressCallback,
  ExtractionProvider,
} from "../../provider";
import type {
  DocumentText,
  Extraction,
  ExtractedValue,
  PageGeometry,
  ScalarFieldKey,
  Word,
} from "../../types";
import { extractLineItems } from "./line-items";
import { unionBox } from "./lines";
import type { OcrDocument, OcrOptions, OcrPageInput } from "./ocr";
import { ocrPages } from "./ocr";
import type { PdfTextDocument, PdfTextOptions } from "./pdf-text";
import { extractPdfText, totalCharCount } from "./pdf-text";
import type { PdfRasteriser } from "./rasterise";
import { rasterisePdfPages } from "./rasterise";
import type { FieldCandidate } from "./rules";
import { SCALAR_MATCHERS } from "./rules";

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

/** Registry id. @see ../registry */
export const LOCAL_PROVIDER_ID = "local";

/** Shown in the UI. Names the guarantee, not the library. */
export const LOCAL_PROVIDER_LABEL = "On-device OCR";

/** The media types this provider accepts. Anything else is `unsupported_media`. */
export const SUPPORTED_MEDIA_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

/**
 * The size budget, 10 MB.
 *
 * Not a licence limit but a physics one: recognition runs in this tab, so a
 * 100 MB scan means minutes of frozen WASM and, on a phone, a dead page. A
 * refusal in 1 ms is a better product than a hang.
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * The scanned-PDF threshold: mean non-whitespace characters per page below which
 * a PDF's embedded text layer is not believed.
 *
 * 20 is deliberately low. A real page of invoice text runs to several hundred
 * characters, while a scan carries either nothing at all or a stray artefact
 * ("1", a page number) — so anything in between is ambiguous and OCR, which
 * costs time but reads the pixels that are actually there, is the safer answer.
 */
export const MIN_TEXT_LAYER_CHARS_PER_PAGE = 20;

/** The reason recorded for a field no rule could find. */
export const NOT_FOUND_REASON = "Not found in document";

/**
 * Overall ratio at which the `ocr` phase begins — i.e. the slice reserved for
 * reading the file (decoding it, and for a scanned PDF rasterising its pages).
 */
export const OCR_START_RATIO = 0.1;

/**
 * Overall ratio at which the `matching` phase begins. The rule pass is
 * milliseconds of pure computation next to OCR, so it gets the last sliver;
 * what matters is that the bar reaches it and then reaches 1.
 */
export const MATCHING_START_RATIO = 0.9;

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * The file's media type, or `null` when it is not one we accept.
 *
 * Falls back to the filename extension when the browser reports no type at all,
 * which happens for files dragged from some archive tools and for `File`s
 * constructed without one. `image/jpg` is accepted as an alias because a few
 * older tools still write it, and it is unambiguously a JPEG.
 */
export function resolveMediaType(file: {
  type?: string;
  name?: string;
}): SupportedMediaType | null {
  const declared = (file.type ?? "").trim().toLowerCase();
  if (declared === "image/jpg") return "image/jpeg";
  if ((SUPPORTED_MEDIA_TYPES as readonly string[]).includes(declared)) {
    return declared as SupportedMediaType;
  }
  if (declared.length > 0) return null;

  const name = (file.name ?? "").trim().toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

/**
 * Check a file before any parsing work happens.
 *
 * @returns The resolved media type, which is also the routing decision.
 * @throws {ExtractionError} `unsupported_media` for anything but PDF/PNG/JPEG;
 *   `too_large` above `MAX_FILE_BYTES`. Type is checked first, so a 40 MB
 *   spreadsheet reads as the wrong *kind* of file rather than a big one.
 */
export function validateFile(file: File): SupportedMediaType {
  const mediaType = resolveMediaType(file);
  if (mediaType === null) {
    throw new ExtractionError("unsupported_media");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ExtractionError("too_large");
  }
  return mediaType;
}

/* ------------------------------------------------------------------ *
 * Route selection
 * ------------------------------------------------------------------ */

/**
 * Is a PDF's embedded text layer worth using, or is this a scan?
 *
 * Uses the per-page `charCount` the text source already reported (via
 * `totalCharCount`) rather than re-deriving it from the words: the count is
 * taken before word splitting and excludes whitespace, which is what makes a
 * scanned page whose text layer holds nothing but spaces read as `0`.
 *
 * Averaged across pages, not required of every page: a cover sheet with two
 * words in front of nine dense pages is still a digital PDF.
 *
 * @returns `false` for a document with no pages — there is nothing to believe.
 */
export function isTextLayerUsable(document: PdfTextDocument): boolean {
  if (document.pages.length === 0) return false;
  return (
    totalCharCount(document) / document.pages.length >=
    MIN_TEXT_LAYER_CHARS_PER_PAGE
  );
}

/* ------------------------------------------------------------------ *
 * Progress mapping
 * ------------------------------------------------------------------ */

/**
 * Emits the provider contract's progress: `0..1` across the whole run, never
 * backwards, never the same report twice, and ending at exactly `1`.
 *
 * A phase change is reported even when the ratio has not moved, so the UI can
 * change its wording at the hand-off from OCR to matching without the bar
 * jumping. The two guarantees together are why this is a gate rather than a
 * plain call-through.
 */
export function createLocalProgressReporter(
  onProgress?: ExtractionProgressCallback
): (phase: ExtractionPhase, ratio: number) => void {
  let started = false;
  let lastRatio = 0;
  let lastPhase: ExtractionPhase | null = null;

  return (phase: ExtractionPhase, ratio: number): void => {
    const clamped = Math.min(Math.max(ratio, 0), 1);
    if (started && clamped < lastRatio) return;
    if (started && clamped === lastRatio && phase === lastPhase) return;
    started = true;
    lastRatio = clamped;
    lastPhase = phase;
    onProgress?.({ phase, ratio: clamped });
  };
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

/**
 * Alternate readings the source offered for the words behind a value, minus the
 * value itself and any duplicates.
 *
 * Mirrors the private helper in `./line-items`, which owns the same job for
 * table rows: alternatives are a property of the OCR words, and the rule layer
 * (`./rules`) deliberately reports only which words it used.
 */
function alternativesFor(words: readonly Word[], value: string): string[] {
  const seen = new Set<string>([value]);
  const alternatives: string[] = [];
  for (const word of words) {
    for (const alternative of word.alternatives ?? []) {
      const trimmed = alternative.trim();
      if (trimmed.length === 0 || seen.has(trimmed)) continue;
      seen.add(trimmed);
      alternatives.push(trimmed);
    }
  }
  return alternatives;
}

/** The value a field takes when no rule found it. Never an error, never absent. */
export function notFoundValue(): ExtractedValue {
  return {
    value: "",
    // `MatchStrength.NOT_FOUND` composed against no words: exactly 0, never NaN.
    confidence: 0,
    reason: NOT_FOUND_REASON,
    alternatives: [],
    bbox: null,
    page: 0,
  };
}

/**
 * Turn one matcher's answer into a field value.
 *
 * The two halves of confidence meet here and nowhere else: the source's
 * character confidence (mean over the words the value was read from) times the
 * rule's `matchStrength`. A candidate with no words is treated as not found —
 * the confidence would be 0 and the box empty, so calling it found would be a
 * fabrication.
 */
export function toExtractedValue(
  candidate: FieldCandidate | null
): ExtractedValue {
  if (candidate === null || candidate.words.length === 0) {
    return notFoundValue();
  }

  const { words } = candidate;
  return {
    value: candidate.value,
    confidence: composeConfidence(words, candidate.matchStrength),
    reason: candidate.reason,
    alternatives: alternativesFor(words, candidate.value),
    bbox: unionBox(words.map((word) => word.bbox)),
    page: words[0].page,
  };
}

/**
 * Run every rule over a normalised document and assemble the result.
 *
 * Pure: same pages in, same `Extraction` out, whichever source produced them.
 * Every `ScalarFieldKey` is present because the loop is driven by
 * `SCALAR_MATCHERS`, which `ScalarFieldKey` makes exhaustive.
 */
export function assembleExtraction(document: DocumentText): Extraction {
  const pages: PageGeometry[] = document.pages.map((page) => ({
    index: page.index,
    width: page.width,
    height: page.height,
  }));

  const fields = Object.fromEntries(
    Object.entries(SCALAR_MATCHERS).map(([key, match]) => [
      key,
      toExtractedValue(match(document.pages)),
    ])
  ) as Record<ScalarFieldKey, ExtractedValue>;

  return {
    source: document.source,
    pages,
    fields,
    lineItems: extractLineItems(document.pages),
  };
}

/* ------------------------------------------------------------------ *
 * The provider
 * ------------------------------------------------------------------ */

/** `extractPdfText`, narrowed. @see ./pdf-text */
export type PdfTextReader = (
  bytes: ArrayBuffer | Uint8Array,
  options?: PdfTextOptions
) => Promise<PdfTextDocument>;

/** `ocrPages`, narrowed. @see ./ocr */
export type OcrRunner = (
  inputs: readonly OcrPageInput[],
  options?: OcrOptions
) => Promise<OcrDocument>;

/** Reads an image's pixel size, or `null` when it cannot. @see readImageSize */
export type ImageSizeReader = (
  file: Blob
) => Promise<{ width: number; height: number } | null>;

/**
 * Pixel size of an image file, so its OCR page reports the paper's size rather
 * than the extent of the words found on it (which would place highlights
 * slightly wrong on a document with wide margins).
 *
 * `createImageBitmap` is browser-only and decoding can fail on a corrupt file;
 * both degrade to `null`, and `ocrPages` falls back to `wordsExtent`. A missing
 * page size is a cosmetic problem, never a reason to fail an extraction.
 */
export const readImageSize: ImageSizeReader = async (file) => {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
};

/**
 * The seams. Every default is the real implementation; a test replaces the ones
 * it does not want to run, exactly as `OcrOptions.createWorker` does one level
 * down.
 */
export interface LocalProviderDeps {
  /** @see extractPdfText */
  readPdfText?: PdfTextReader;
  /** @see ocrPages */
  runOcr?: OcrRunner;
  /** Browser-only: needs a canvas. @see rasterisePdfPages */
  rasterisePdf?: PdfRasteriser;
  /** @see readImageSize */
  readImageSize?: ImageSizeReader;
  /** Passed through to `ocrPages`, e.g. to inject a fake tesseract worker. */
  ocrOptions?: Omit<OcrOptions, "onProgress">;
  /** Passed through to `extractPdfText`. */
  pdfTextOptions?: PdfTextOptions;
}

/**
 * Build the local provider.
 *
 * @param deps Test seams; every one defaults to the real source.
 */
export function createLocalProvider(
  deps: LocalProviderDeps = {}
): ExtractionProvider {
  const {
    readPdfText = extractPdfText,
    runOcr = ocrPages,
    rasterisePdf = rasterisePdfPages,
    readImageSize: readSize = readImageSize,
    ocrOptions = {},
    pdfTextOptions = {},
  } = deps;

  /** OCR a set of pages, folding its `0..1` progress into the run's budget. */
  const ocr = (
    inputs: readonly OcrPageInput[],
    report: (phase: ExtractionPhase, ratio: number) => void
  ): Promise<OcrDocument> =>
    runOcr(inputs, {
      ...ocrOptions,
      onProgress: ({ ratio }) =>
        report(
          "ocr",
          OCR_START_RATIO + (MATCHING_START_RATIO - OCR_START_RATIO) * ratio
        ),
    });

  /**
   * A PDF: text layer if it holds real text, otherwise rasterise and recognise.
   * The bytes are read once and used for both attempts.
   */
  const readPdf = async (
    file: File,
    report: (phase: ExtractionPhase, ratio: number) => void
  ): Promise<DocumentText> => {
    const bytes = await file.arrayBuffer();

    const textLayer = await readPdfText(bytes, pdfTextOptions);
    if (textLayer.pages.length === 0) {
      throw new ExtractionError("unreadable", "That PDF has no pages.");
    }

    if (isTextLayerUsable(textLayer)) {
      // No OCR phase on this route: parsing the text layer *was* the work.
      report("reading", MATCHING_START_RATIO);
      return textLayer;
    }

    const inputs = await rasterisePdf(bytes, {
      onPage: (rendered, total) =>
        report("reading", (OCR_START_RATIO * rendered) / Math.max(total, 1)),
    });
    report("reading", OCR_START_RATIO);
    return ocr(inputs, report);
  };

  /** An image: straight to OCR, with its own pixel size where we can read it. */
  const readImage = async (
    file: File,
    report: (phase: ExtractionPhase, ratio: number) => void
  ): Promise<DocumentText> => {
    const size = await readSize(file);
    report("reading", OCR_START_RATIO);
    return ocr([{ source: file, ...(size ?? {}) }], report);
  };

  return {
    id: LOCAL_PROVIDER_ID,
    label: LOCAL_PROVIDER_LABEL,

    async extract(file, onProgress) {
      // Before anything else, and before any progress is claimed.
      const mediaType = validateFile(file);

      const report = createLocalProgressReporter(onProgress);
      report("reading", 0);

      const document =
        mediaType === "application/pdf"
          ? await readPdf(file, report)
          : await readImage(file, report);

      report("matching", MATCHING_START_RATIO);
      const extraction = assembleExtraction(document);
      report("matching", 1);

      return extraction;
    },
  };
}
