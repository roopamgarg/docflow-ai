/**
 * The OCR text source: recognises images and rasterised PDF pages with
 * tesseract.js and normalises the result into the shared `Page` / `Word` model.
 *
 * Two halves, deliberately separated (the same split as `./pdf-text`):
 *
 * 1. **Pure mapping** — `blocksToWords`, `tesseractWordToWord`,
 *    `scaleOcrConfidence`, `wordAlternatives`, `readableWordCount`,
 *    `ocrProgressRatio` and `createOcrProgressReporter` take plain data and
 *    return plain data. Real recognition is slow and its output drifts between
 *    tesseract builds and machines, so every rule that could be wrong lives
 *    here and is tested against the captured fixtures in `./__fixtures__`
 *    rather than by running OCR.
 * 2. **I/O** — `ocrPages` owns the worker lifecycle (one worker for the whole
 *    document, terminated on every path) and delegates all interpretation to
 *    the functions above.
 *
 * This module does NOT decide *when* to OCR. A scanned PDF is detected from the
 * text layer's emptiness (`PdfTextPage.charCount`) and rasterised by ticket 008,
 * which hands the canvases here; preview rendering is ticket 012.
 *
 * ## tesseract.js 7 API notes (verified against the installed package)
 *
 * - `createWorker(langs, oem, options, config)` still has the v6 shape, and
 *   `worker.initialize` / `worker.loadLanguage` are still gone — loading and
 *   initialisation happen inside `createWorker`, and `worker.reinitialize` is
 *   the only way back in. Nothing here needs it.
 * - Non-text output is still opt-in, and the option key is still `blocks`:
 *   `recognize`'s third argument defaults to `{ text: true }`, and the worker
 *   returns `blocks: null` unless asked. **Without `{ blocks: true }` there are
 *   no words at all**, only a flat string — see `OCR_OUTPUT_FORMATS`.
 * - `word.choices` is populated by default (no `lstm_choice_mode` needed), but
 *   the LSTM engine almost always supplies exactly one choice: the reading it
 *   picked. See `wordAlternatives`.
 */

import { ExtractionError, isExtractionError } from "../../errors";
import type {
  ExtractionProgress,
  ExtractionProgressCallback,
} from "../../provider";
import type { BoundingBox, DocumentText, Page, Word } from "../../types";

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

/** The language model vendored into `public/tesseract/` by ticket 001. */
export const OCR_LANGUAGE = "eng";

/**
 * `OEM.LSTM_ONLY`. Restated as a literal so this module needs no value import
 * from tesseract.js, keeping the package out of every bundle that only uses the
 * pure mapping. The legacy engine would need the extra `.traineddata`
 * components and is markedly slower for no accuracy gain on printed documents.
 */
export const OCR_ENGINE_MODE = 1;

/**
 * The output formats `recognize` is asked for.
 *
 * `blocks` is the whole point: it is `false` by default in tesseract.js 7, and
 * with it off the result carries a plain string and `blocks: null`, so the
 * block-tree walk finds nothing and every page looks blank. `text` comes back
 * regardless (the worker merges this over its own defaults), and costs nothing.
 */
export const OCR_OUTPUT_FORMATS = { blocks: true } as const;

/**
 * Where the vendored tesseract assets live, relative to the site root — see
 * `scripts/copy-assets.mjs`. Pointing at all three is what keeps a run offline:
 * left unset, tesseract.js falls back to jsDelivr for the worker script, the
 * WASM core and the ~15 MB language model.
 *
 * `corePath` names the **exact `.js` file**, not the directory. Given a
 * directory, tesseract.js appends a filename it picks from the browser's SIMD
 * support and the engine mode — for `OEM.LSTM_ONLY` that is
 * `tesseract-core-relaxedsimd-lstm.wasm.js` or `tesseract-core-simd-lstm.wasm.js`,
 * neither of which is vendored, so the offline guarantee would break on some
 * browsers and not others. The full SIMD core that *is* vendored runs the LSTM
 * engine fine.
 */
export const DEFAULT_OCR_WORKER_PATH = "/tesseract/worker.min.js";
/** @see DEFAULT_OCR_WORKER_PATH */
export const DEFAULT_OCR_CORE_PATH = "/tesseract/tesseract-core-simd.wasm.js";
/** Directory: the worker appends `eng.traineddata.gz`. @see DEFAULT_OCR_WORKER_PATH */
export const DEFAULT_OCR_LANG_PATH = "/tesseract";

/**
 * The floor a word must clear to count as text at all, in the `0..1` space of
 * `Word.confidence`.
 *
 * Used only to answer "did this page yield anything?" — words below it are
 * still returned, because a 0.2-confidence word in the right place is evidence
 * the rule engine may want, and dropping it would silently change what the
 * highlight overlay shows. Blank and unreadable pages are the case this
 * catches, and they typically produce no words at all.
 */
export const MIN_WORD_CONFIDENCE = 0.3;

/**
 * The share of the OCR phase's progress reserved for starting the worker:
 * loading the core, the language data and initialising the API. That work
 * happens once per document however many pages follow, and on a cold cache it
 * is a visible wait, so it gets a slice rather than reading as 0.
 */
export const OCR_SETUP_WEIGHT = 0.1;

/* ------------------------------------------------------------------ *
 * The shape tesseract.js returns
 * ------------------------------------------------------------------ */

/**
 * The parts of a tesseract.js result this module reads, restated as plain data.
 *
 * Structural on purpose: the captured fixtures in `./__fixtures__` are imported
 * as JSON and tests build partial trees by hand, so nothing here may depend on
 * tesseract's own types. Real payloads carry more fields than these (and some
 * of them lie — `blocktype` and `is_ltr` arrive as numbers where the typings
 * promise a string and a boolean), which is exactly why only what is used is
 * declared.
 */
export interface TesseractBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One candidate reading of a word, with its own 0..100 score. */
export interface TesseractChoice {
  text: string;
  confidence: number;
}

/** A recognised word. `confidence` is 0..100 here, not 0..1. */
export interface TesseractWord {
  text: string;
  confidence: number;
  bbox: TesseractBbox;
  choices?: readonly TesseractChoice[];
}

/** Every level of the tree is optional: a degenerate page can stop anywhere. */
export interface TesseractLine {
  words?: readonly TesseractWord[];
}

/** @see TesseractLine */
export interface TesseractParagraph {
  lines?: readonly TesseractLine[];
}

/** @see TesseractLine */
export interface TesseractBlock {
  paragraphs?: readonly TesseractParagraph[];
}

/**
 * `RecognizeResult["data"]`, narrowed to the one field that matters. `blocks`
 * is `null` when structured output was not requested — the v7 default.
 */
export interface TesseractPageResult {
  blocks?: readonly TesseractBlock[] | null;
}

/** One `{ status, progress }` report from tesseract's `logger` callback. */
export interface OcrLogEvent {
  status: string;
  /** `0..1` within the reported status, not within the run. */
  progress: number;
}

/* ------------------------------------------------------------------ *
 * Pure mapping
 * ------------------------------------------------------------------ */

/**
 * Map tesseract's 0..100 score onto the `0..1` `Word.confidence` contract.
 *
 * Clamped, and non-finite input reads as 0: a `NaN` here would propagate
 * through `composeConfidence` into a field the UI renders as `NaN%` and treats
 * as neither high nor low confidence.
 */
export function scaleOcrConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.min(Math.max(confidence / 100, 0), 1);
}

/** Order a raw bbox so `x0 <= x1` and `y0 <= y1`, as `BoundingBox` requires. */
export function toBoundingBox(bbox: TesseractBbox): BoundingBox {
  return {
    x0: Math.min(bbox.x0, bbox.x1),
    y0: Math.min(bbox.y0, bbox.y1),
    x1: Math.max(bbox.x0, bbox.x1),
    y1: Math.max(bbox.y0, bbox.y1),
  };
}

/**
 * The alternate readings worth showing a reviewer: `word.choices` minus the
 * reading tesseract actually picked, de-duplicated, in tesseract's own order.
 *
 * Filtering the chosen text out is what makes this useful rather than noise.
 * The LSTM engine returns `choices: [{ text: word.text }]` for virtually every
 * word, so without the filter every word would carry an "alternative"
 * identical to itself, and the UI's "did it maybe read this instead?" affordance
 * would fire on all of them. Note the chosen reading is not necessarily first —
 * for a blurred `#:` the legacy engine returns `l:`, `0:`, `J:`, `I:`, `#:`.
 *
 * @returns `undefined` (not `[]`) when there is nothing to offer, so
 *   `Word.alternatives` stays absent rather than present-and-empty.
 */
export function wordAlternatives(word: TesseractWord): string[] | undefined {
  const chosen = word.text.trim();
  const alternatives: string[] = [];

  for (const choice of word.choices ?? []) {
    const text = choice.text.trim();
    if (text.length === 0) continue;
    if (text === chosen) continue;
    if (alternatives.includes(text)) continue;
    alternatives.push(text);
  }

  return alternatives.length > 0 ? alternatives : undefined;
}

/** Map one recognised word onto the shared `Word` contract. */
export function tesseractWordToWord(
  word: TesseractWord,
  pageIndex: number
): Word {
  const alternatives = wordAlternatives(word);
  return {
    text: word.text.trim(),
    confidence: scaleOcrConfidence(word.confidence),
    bbox: toBoundingBox(word.bbox),
    page: pageIndex,
    ...(alternatives ? { alternatives } : {}),
  };
}

/**
 * Walk `blocks → paragraphs → lines → words` and flatten to `Word[]` in
 * tesseract's reading order.
 *
 * Every level is treated as possibly missing, and `blocks: null` — what a
 * recognition run that was not asked for structured output returns — yields an
 * empty list rather than throwing, so the failure surfaces as
 * `no_text_found` from one place instead of a `TypeError` from here.
 *
 * Words whose text is blank are dropped: tesseract emits a few on noisy scans,
 * and an invisible word is a match candidate the rule engine cannot justify and
 * a zero-area highlight the reviewer cannot see.
 */
export function blocksToWords(
  blocks: readonly TesseractBlock[] | null | undefined,
  pageIndex: number
): Word[] {
  const words: Word[] = [];

  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const mapped = tesseractWordToWord(word, pageIndex);
          if (mapped.text.length === 0) continue;
          words.push(mapped);
        }
      }
    }
  }

  return words;
}

/**
 * How many words clear the confidence floor. `0` means the page is blank or
 * unreadable — see `MIN_WORD_CONFIDENCE`.
 */
export function readableWordCount(
  words: readonly Word[],
  minConfidence: number = MIN_WORD_CONFIDENCE
): number {
  let count = 0;
  for (const word of words) {
    if (word.confidence >= minConfidence) count += 1;
  }
  return count;
}

/**
 * The smallest page that contains every word — the last-resort page size, used
 * only when the caller passed neither explicit dimensions nor a sized source
 * (i.e. an image `Blob`, whose pixel size cannot be read without decoding it).
 *
 * Approximate by construction: it is the text's extent, not the paper's, so a
 * document with a wide margin comes out slightly small. `Word.bbox` values stay
 * inside it either way, which is what the overlay needs.
 */
export function wordsExtent(words: readonly Word[]): {
  width: number;
  height: number;
} {
  let width = 0;
  let height = 0;
  for (const word of words) {
    width = Math.max(width, word.bbox.x1);
    height = Math.max(height, word.bbox.y1);
  }
  return { width, height };
}

/* ------------------------------------------------------------------ *
 * Pure progress weighting
 * ------------------------------------------------------------------ */

/**
 * Does this logger status describe recognising a page, as opposed to the
 * one-off worker setup?
 *
 * tesseract.js 7 reports `loading tesseract core`, `initializing tesseract`,
 * `loading language traineddata` and `initializing api` while starting up, then
 * `recognizing text` per page. Matched on substring rather than equality so a
 * reworded status degrades to "still setting up" (progress stalls in the first
 * 10%) instead of throwing the page weighting out.
 */
export function isRecognitionStatus(status: string): boolean {
  return status.toLowerCase().includes("recogni");
}

/**
 * The whole-run ratio a single logger event implies.
 *
 * Setup shares `OCR_SETUP_WEIGHT`; the rest is split evenly across pages, so
 * page `i` of `n` spans `[setup + (1 - setup) * i / n, setup + (1 - setup) *
 * (i + 1) / n]`. With the defaults and two pages: setup at half done is `0.05`,
 * page 0 finishing recognition is `0.55`, page 1 halfway is `0.775`.
 *
 * Monotonic in its inputs, but not on its own a monotonic *sequence*:
 * tesseract's per-status progress restarts at 0 for each page and its
 * `recognizing text` reports are not strictly increasing. Clamping that is
 * `createOcrProgressReporter`'s job.
 */
export function ocrProgressRatio(
  event: OcrLogEvent,
  pageIndex: number,
  pageCount: number
): number {
  const progress = Number.isFinite(event.progress)
    ? Math.min(Math.max(event.progress, 0), 1)
    : 0;

  if (!isRecognitionStatus(event.status)) {
    return OCR_SETUP_WEIGHT * progress;
  }

  // No pages means nothing to weight; report setup complete and stop there.
  if (pageCount <= 0) return OCR_SETUP_WEIGHT;

  const page = Math.min(Math.max(pageIndex, 0), pageCount - 1);
  const done = (page + progress) / pageCount;
  return OCR_SETUP_WEIGHT + (1 - OCR_SETUP_WEIGHT) * done;
}

/**
 * Turns tesseract's logger stream into `ExtractionProgress`.
 *
 * Stateful, but OCR-free: feed it plain `{ status, progress }` events and it
 * behaves exactly as it does in a real run. It holds the two guarantees the
 * provider contract makes and `ocrProgressRatio` cannot:
 *
 * - **Monotonic.** The reported ratio is a running maximum, and only a strict
 *   increase is emitted, so a page starting over never walks the bar backwards
 *   and no ratio is ever reported twice.
 * - **Ends at 1.** `finish()` reports `1` whatever the last logger event
 *   claimed, and at most once.
 */
export interface OcrProgressReporter {
  /** The highest ratio reported so far. */
  readonly ratio: number;
  /** Attribute subsequent logger events to page `index`. */
  page(index: number): void;
  /** Feed one tesseract logger event. */
  log(event: OcrLogEvent): void;
  /** Emit the terminal `ratio: 1`. Idempotent. */
  finish(): void;
}

/** @see OcrProgressReporter */
export function createOcrProgressReporter(
  pageCount: number,
  onProgress?: ExtractionProgressCallback
): OcrProgressReporter {
  let ratio = 0;
  let pageIndex = 0;
  let started = false;
  let finished = false;

  /** Emit only a first report or a strict increase — never a repeat. */
  const report = (next: number): void => {
    const clamped = Math.min(Math.max(next, 0), 1);
    if (started && clamped <= ratio) return;
    ratio = clamped;
    started = true;
    const progress: ExtractionProgress = { phase: "ocr", ratio };
    onProgress?.(progress);
  };

  return {
    get ratio() {
      return ratio;
    },
    page(index: number) {
      pageIndex = index;
    },
    log(event: OcrLogEvent) {
      if (finished) return;
      report(ocrProgressRatio(event, pageIndex, pageCount));
    },
    finish() {
      if (finished) return;
      finished = true;
      // The last page's own logger event usually already reported 1; `report`
      // swallows the duplicate so the sequence stays strictly increasing.
      report(1);
    },
  };
}

/* ------------------------------------------------------------------ *
 * Worker lifecycle
 * ------------------------------------------------------------------ */

/**
 * What tesseract may be handed here: an image blob (the uploaded `File`) or a
 * canvas (a PDF page rasterised by ticket 008, typically at ~2x for legible
 * small print).
 *
 * URL strings and `HTMLImageElement` are deliberately excluded even though
 * tesseract.js accepts them: it resolves both by `fetch()`-ing the URL, and
 * this app makes no network requests. Callers holding an `<img>` should pass the
 * originating `File`, or draw it to a canvas.
 *
 * Raw bytes are accepted as well, because they are the one source tesseract.js
 * decodes identically in the browser and under Node — its Node `loadImage` does
 * not understand `Blob` — which is what makes a real-OCR smoke test possible.
 */
export type OcrImageSource =
  | Blob
  | Uint8Array
  | HTMLCanvasElement
  | OffscreenCanvas;

/** One page to recognise. */
export interface OcrPageInput {
  source: OcrImageSource;
  /**
   * Page size in pixels, in the space `Word.bbox` will be reported in — i.e.
   * the pixel size of what tesseract sees. Read from the source when it is a
   * canvas; supply it explicitly for a `Blob`, whose size is otherwise unknown
   * until it is decoded. Falls back to `wordsExtent`.
   *
   * A page rasterised at 2x therefore reports a 2x `width`/`height` and 2x
   * boxes. That is self-consistent, which is all `BoundingBox` requires:
   * consumers scale boxes by `width` to reach their own zoom.
   */
  width?: number;
  height?: number;
}

/** The subset of `Tesseract.Worker` used here — the seam tests replace. */
export interface OcrWorker {
  recognize(
    image: OcrImageSource,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>
  ): Promise<{ data: TesseractPageResult }>;
  terminate(): Promise<unknown>;
}

/** The options `ocrPages` passes to `createWorker`. */
export interface OcrWorkerOptions {
  workerPath: string;
  corePath: string;
  langPath: string;
  logger: (event: OcrLogEvent) => void;
  errorHandler: (error: unknown) => void;
}

/** `createWorker`, narrowed. Injectable so tests need no real worker. */
export type OcrWorkerFactory = (
  language: string,
  engineMode: number,
  options: OcrWorkerOptions
) => Promise<OcrWorker>;

/** Options for `ocrPages`. Every path exists so a test can point elsewhere. */
export interface OcrOptions {
  workerPath?: string;
  corePath?: string;
  langPath?: string;
  language?: string;
  engineMode?: number;
  /** @see MIN_WORD_CONFIDENCE */
  minWordConfidence?: number;
  onProgress?: ExtractionProgressCallback;
  /** @see OcrWorkerFactory */
  createWorker?: OcrWorkerFactory;
}

/** `DocumentText` from this source. */
export interface OcrDocument extends DocumentText {
  source: "ocr";
}

/**
 * Import tesseract.js only when a real worker is actually needed.
 *
 * Dynamic on purpose: the pure mapping above is imported by the rule engine and
 * by tests, and neither should pull in a multi-megabyte OCR runtime — nor
 * should the app's first paint.
 */
const createTesseractWorker: OcrWorkerFactory = async (
  language,
  engineMode,
  options
) => {
  const { createWorker } = await import("tesseract.js");
  // `OEM` is a numeric enum, so the literal in `OCR_ENGINE_MODE` needs the
  // assertion rather than a value import of the enum itself.
  const engine = engineMode as Parameters<typeof createWorker>[1];
  const worker = await createWorker(language, engine, options);
  // `OcrWorker` deliberately narrows `Tesseract.Worker` to the sources this app
  // passes, which the two type sets cannot express as a subtype of one another:
  // tesseract also accepts URLs and `<img>`/`<video>` elements (all excluded
  // here as they load over the network), and types raw bytes as Node's `Buffer`
  // rather than the `Uint8Array` it actually is at runtime.
  return worker as unknown as OcrWorker;
};

/** Pixel size of a sized source (canvas), or `null` for a `Blob`. */
export function ocrSourceSize(
  source: OcrImageSource
): { width: number; height: number } | null {
  const sized = source as { width?: unknown; height?: unknown };
  if (
    typeof sized.width === "number" &&
    typeof sized.height === "number" &&
    sized.width > 0 &&
    sized.height > 0
  ) {
    return { width: sized.width, height: sized.height };
  }
  return null;
}

/** Explicit dimensions, else the source's own, else the text's extent. */
function resolvePageSize(
  input: OcrPageInput,
  words: readonly Word[]
): { width: number; height: number } {
  if (input.width && input.height) {
    return { width: input.width, height: input.height };
  }
  return ocrSourceSize(input.source) ?? wordsExtent(words);
}

/**
 * Recognise every page of a document and return the shared word model.
 *
 * One worker serves the whole document — starting one costs a WASM
 * instantiation plus reading the language model, which dwarfs the per-page
 * recognition on a short document — and it is terminated in a `finally`, so a
 * failure part-way through a 20-page scan cannot leak a worker (and, in the
 * browser, its WASM heap) for the rest of the session.
 *
 * @param inputs One entry per page, in document order.
 * @throws {ExtractionError} `no_text_found` when a page yields no word above
 *   `minWordConfidence` — the likeliest real failure, and the one 011 writes
 *   specific copy for. `unreadable` when tesseract cannot decode a page's
 *   bytes; `internal` when the worker itself fails to start.
 */
export async function ocrPages(
  inputs: readonly OcrPageInput[],
  options: OcrOptions = {}
): Promise<OcrDocument> {
  if (inputs.length === 0) {
    throw new ExtractionError(
      "internal",
      undefined,
      { cause: new Error("ocrPages was called with no pages") }
    );
  }

  const {
    workerPath = DEFAULT_OCR_WORKER_PATH,
    corePath = DEFAULT_OCR_CORE_PATH,
    langPath = DEFAULT_OCR_LANG_PATH,
    language = OCR_LANGUAGE,
    engineMode = OCR_ENGINE_MODE,
    minWordConfidence = MIN_WORD_CONFIDENCE,
    onProgress,
    createWorker = createTesseractWorker,
  } = options;

  const reporter = createOcrProgressReporter(inputs.length, onProgress);

  // tesseract.js reports worker-side failures twice: it rejects the pending job
  // *and* calls `errorHandler`, throwing inside its own message handler when
  // there is none. Holding the last one keeps that noise out of the console and
  // gives the thrown `ExtractionError` a cause worth reading.
  let workerError: unknown;

  let worker: OcrWorker;
  try {
    worker = await createWorker(language, engineMode, {
      workerPath,
      corePath,
      langPath,
      logger: (event) => reporter.log(event),
      errorHandler: (error) => {
        workerError = error;
      },
    });
  } catch (error) {
    throw new ExtractionError("internal", undefined, {
      cause: workerError ?? error,
    });
  }

  try {
    const pages: Page[] = [];

    for (const [pageIndex, input] of inputs.entries()) {
      reporter.page(pageIndex);

      let result: TesseractPageResult;
      try {
        const recognized = await worker.recognize(
          input.source,
          {},
          OCR_OUTPUT_FORMATS
        );
        result = recognized.data;
      } catch (error) {
        // The worker started, so the language data and core are fine; what is
        // left is the image itself.
        throw new ExtractionError("unreadable", undefined, {
          cause: workerError ?? error,
        });
      }

      const words = blocksToWords(result.blocks, pageIndex);
      if (readableWordCount(words, minWordConfidence) === 0) {
        throw new ExtractionError("no_text_found");
      }

      const { width, height } = resolvePageSize(input, words);
      pages.push({ index: pageIndex, width, height, words });
    }

    reporter.finish();
    return { pages, source: "ocr" };
  } catch (error) {
    if (isExtractionError(error)) throw error;
    throw new ExtractionError("internal", undefined, { cause: error });
  } finally {
    await worker.terminate();
  }
}
