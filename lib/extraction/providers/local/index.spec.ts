import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";

import { composeConfidence, MatchStrength } from "../../confidence";
import { ExtractionError, isExtractionError } from "../../errors";
import type { ExtractionProgress } from "../../provider";
import type { Word } from "../../types";
import type { OcrDocument, OcrPageInput } from "./ocr";
import type { PdfTextDocument, PdfTextPage } from "./pdf-text";
import { rasterisePdfPages } from "./rasterise";
import type { FieldCandidate } from "./rules";
import {
  createLocalProgressReporter,
  createLocalProvider,
  isTextLayerUsable,
  LOCAL_PROVIDER_ID,
  LOCAL_PROVIDER_LABEL,
  MATCHING_START_RATIO,
  MAX_FILE_BYTES,
  MIN_TEXT_LAYER_CHARS_PER_PAGE,
  NOT_FOUND_REASON,
  notFoundValue,
  OCR_START_RATIO,
  resolveMediaType,
  toExtractedValue,
  validateFile,
} from "./index";

const FIXTURE_PATH = fileURLToPath(
  new URL("./__fixtures__/sample-invoice.pdf", import.meta.url)
);

/** Await a promise expected to reject with an `ExtractionError`, and return it. */
async function captureError(promise: Promise<unknown>): Promise<ExtractionError> {
  try {
    await promise;
  } catch (error) {
    if (!isExtractionError(error)) throw error;
    return error;
  }
  throw new Error("expected the promise to reject with an ExtractionError");
}

/** A minimal `PdfTextDocument` whose pages carry the given per-page charCounts. */
function pdfTextDocument(charCounts: number[]): PdfTextDocument {
  const pages: PdfTextPage[] = charCounts.map((charCount, index) => ({
    index,
    width: 612,
    height: 792,
    words: [],
    charCount,
  }));
  return { source: "pdf-text", pages };
}

function word(overrides: Partial<Word> = {}): Word {
  return {
    text: "x",
    confidence: 1,
    bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
    page: 0,
    ...overrides,
  };
}

/** A no-op `OcrDocument` — enough shape for `assembleExtraction` to run over. */
function ocrDocument(): OcrDocument {
  return {
    source: "ocr",
    pages: [{ index: 0, width: 100, height: 100, words: [] }],
  };
}

describe("resolveMediaType", () => {
  it("accepts the declared PDF/PNG/JPEG types", () => {
    expect(resolveMediaType({ type: "application/pdf" })).toBe(
      "application/pdf"
    );
    expect(resolveMediaType({ type: "image/png" })).toBe("image/png");
    expect(resolveMediaType({ type: "image/jpeg" })).toBe("image/jpeg");
  });

  it("maps the image/jpg alias onto image/jpeg", () => {
    expect(resolveMediaType({ type: "image/jpg" })).toBe("image/jpeg");
  });

  it("returns null for image/tiff, a declared type outside the supported set", () => {
    expect(resolveMediaType({ type: "image/tiff" })).toBeNull();
  });

  it("falls back to the filename extension when the declared type is empty", () => {
    expect(resolveMediaType({ type: "", name: "a.PNG" })).toBe("image/png");
    expect(resolveMediaType({ type: "", name: "a.pdf" })).toBe(
      "application/pdf"
    );
    expect(resolveMediaType({ type: "", name: "a.jpg" })).toBe("image/jpeg");
    expect(resolveMediaType({ type: "", name: "a.jpeg" })).toBe("image/jpeg");
  });

  it("returns null when neither the type nor a recognised extension is present", () => {
    expect(resolveMediaType({ type: "", name: "a.txt" })).toBeNull();
    expect(resolveMediaType({})).toBeNull();
  });
});

describe("validateFile", () => {
  it("throws unsupported_media for image/tiff", () => {
    const file = new File(["x"], "scan.tiff", { type: "image/tiff" });
    const error = (() => {
      try {
        validateFile(file);
      } catch (thrown) {
        return thrown;
      }
      throw new Error("expected validateFile to throw");
    })();
    expect(isExtractionError(error)).toBe(true);
    expect((error as ExtractionError).code).toBe("unsupported_media");
  });

  it("throws too_large for a file one byte over MAX_FILE_BYTES (10485761)", () => {
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
    const file = new File([new Uint8Array(MAX_FILE_BYTES + 1)], "big.png", {
      type: "image/png",
    });
    expect(file.size).toBe(10485761);

    const error = (() => {
      try {
        validateFile(file);
      } catch (thrown) {
        return thrown;
      }
      throw new Error("expected validateFile to throw");
    })();
    expect(isExtractionError(error)).toBe(true);
    expect((error as ExtractionError).code).toBe("too_large");
  });

  it("checks type before size: an oversize file of an unsupported type is unsupported_media", () => {
    const file = new File([new Uint8Array(MAX_FILE_BYTES + 1)], "big.tiff", {
      type: "image/tiff",
    });
    expect(() => validateFile(file)).toThrowError(
      expect.objectContaining({ code: "unsupported_media" })
    );
  });

  it("returns the resolved media type for a valid file", () => {
    const file = new File(["x"], "invoice.pdf", { type: "application/pdf" });
    expect(validateFile(file)).toBe("application/pdf");
  });
});

describe("createLocalProvider — validation runs before any parsing work", () => {
  it("rejects unsupported_media without calling any injected dependency or onProgress", async () => {
    const readPdfText = vi.fn();
    const runOcr = vi.fn();
    const rasterisePdf = vi.fn();
    const readImageSize = vi.fn();
    const onProgress = vi.fn();

    const provider = createLocalProvider({
      readPdfText,
      runOcr,
      rasterisePdf,
      readImageSize,
    });
    const file = new File(["x"], "scan.tiff", { type: "image/tiff" });

    const error = await captureError(provider.extract(file, onProgress));
    expect(error.code).toBe("unsupported_media");

    expect(readPdfText).not.toHaveBeenCalled();
    expect(runOcr).not.toHaveBeenCalled();
    expect(rasterisePdf).not.toHaveBeenCalled();
    expect(readImageSize).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("rejects too_large without calling any injected dependency or onProgress", async () => {
    const readPdfText = vi.fn();
    const runOcr = vi.fn();
    const rasterisePdf = vi.fn();
    const readImageSize = vi.fn();
    const onProgress = vi.fn();

    const provider = createLocalProvider({
      readPdfText,
      runOcr,
      rasterisePdf,
      readImageSize,
    });
    const file = new File([new Uint8Array(MAX_FILE_BYTES + 1)], "big.png", {
      type: "image/png",
    });

    const error = await captureError(provider.extract(file, onProgress));
    expect(error.code).toBe("too_large");

    expect(readPdfText).not.toHaveBeenCalled();
    expect(runOcr).not.toHaveBeenCalled();
    expect(rasterisePdf).not.toHaveBeenCalled();
    expect(readImageSize).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe("isTextLayerUsable", () => {
  it("is exactly true at mean 20 chars/page ([40, 0])", () => {
    expect(MIN_TEXT_LAYER_CHARS_PER_PAGE).toBe(20);
    expect(isTextLayerUsable(pdfTextDocument([40, 0]))).toBe(true);
  });

  it("is exactly false at mean 19 chars/page ([19, 19]), one below the boundary", () => {
    expect(isTextLayerUsable(pdfTextDocument([19, 19]))).toBe(false);
  });

  it("is false for a document with no pages", () => {
    expect(isTextLayerUsable(pdfTextDocument([]))).toBe(false);
  });
});

describe("createLocalProvider — route selection", () => {
  it("routes PNG straight to OCR, never calling readPdfText, and OCRs the File itself", async () => {
    const readPdfText = vi.fn();
    const rasterisePdf = vi.fn();
    const readImageSize = vi.fn(async () => null);
    const runOcr = vi.fn(async (_inputs: readonly OcrPageInput[]) =>
      ocrDocument()
    );

    const provider = createLocalProvider({
      readPdfText,
      runOcr,
      rasterisePdf,
      readImageSize,
    });
    const file = new File(["x"], "invoice.png", { type: "image/png" });

    const extraction = await provider.extract(file, vi.fn());

    expect(readPdfText).not.toHaveBeenCalled();
    expect(rasterisePdf).not.toHaveBeenCalled();
    expect(runOcr).toHaveBeenCalledTimes(1);
    const [inputs] = runOcr.mock.calls[0];
    expect(inputs).toHaveLength(1);
    expect(inputs[0].source).toBe(file);
    expect(extraction.source).toBe("ocr");
  });

  it("routes JPEG straight to OCR, never calling readPdfText, and OCRs the File itself", async () => {
    const readPdfText = vi.fn();
    const rasterisePdf = vi.fn();
    const readImageSize = vi.fn(async () => null);
    const runOcr = vi.fn(async (_inputs: readonly OcrPageInput[]) =>
      ocrDocument()
    );

    const provider = createLocalProvider({
      readPdfText,
      runOcr,
      rasterisePdf,
      readImageSize,
    });
    const file = new File(["x"], "invoice.jpg", { type: "image/jpeg" });

    const extraction = await provider.extract(file, vi.fn());

    expect(readPdfText).not.toHaveBeenCalled();
    expect(rasterisePdf).not.toHaveBeenCalled();
    expect(runOcr).toHaveBeenCalledTimes(1);
    const [inputs] = runOcr.mock.calls[0];
    expect(inputs).toHaveLength(1);
    expect(inputs[0].source).toBe(file);
    expect(extraction.source).toBe("ocr");
  });

  it("uses the text layer (mean 20 chars/page) and calls neither rasterisePdf nor runOcr", async () => {
    const readPdfText = vi.fn(async () => pdfTextDocument([40, 0]));
    const runOcr = vi.fn();
    const rasterisePdf = vi.fn();

    const provider = createLocalProvider({ readPdfText, runOcr, rasterisePdf });
    const file = new File(["%PDF-1.4"], "invoice.pdf", {
      type: "application/pdf",
    });

    const extraction = await provider.extract(file, vi.fn());

    expect(readPdfText).toHaveBeenCalledTimes(1);
    expect(rasterisePdf).not.toHaveBeenCalled();
    expect(runOcr).not.toHaveBeenCalled();
    expect(extraction.source).toBe("pdf-text");
  });

  it("falls back to rasterise-then-OCR for a sparse text layer (mean 19 chars/page), yielding source: ocr", async () => {
    const readPdfText = vi.fn(async () => pdfTextDocument([19, 19]));
    const rasterisePdf = vi.fn(async (): Promise<OcrPageInput[]> => [
      { source: new Uint8Array(), width: 100, height: 100 },
    ]);
    const runOcr = vi.fn(async () => ocrDocument());

    const provider = createLocalProvider({ readPdfText, runOcr, rasterisePdf });
    const file = new File(["%PDF-1.4"], "invoice.pdf", {
      type: "application/pdf",
    });

    const extraction = await provider.extract(file, vi.fn());

    expect(readPdfText).toHaveBeenCalledTimes(1);
    expect(rasterisePdf).toHaveBeenCalledTimes(1);
    expect(runOcr).toHaveBeenCalledTimes(1);
    expect(extraction.source).toBe("ocr");
  });

  it("throws unreadable for a PDF whose text layer reports no pages, before rasterising or OCRing", async () => {
    const readPdfText = vi.fn(async () => pdfTextDocument([]));
    const rasterisePdf = vi.fn();
    const runOcr = vi.fn();

    const provider = createLocalProvider({ readPdfText, runOcr, rasterisePdf });
    const file = new File(["%PDF-1.4"], "invoice.pdf", {
      type: "application/pdf",
    });

    const error = await captureError(provider.extract(file, vi.fn()));
    expect(error.code).toBe("unreadable");
    expect(rasterisePdf).not.toHaveBeenCalled();
    expect(runOcr).not.toHaveBeenCalled();
  });
});

describe("createLocalProvider — progress", () => {
  it("emits reading:0 -> reading:0.1 -> ocr:0.1..0.9 -> matching:0.9 -> matching:1 on the image/OCR route", async () => {
    const readImageSize = vi.fn(async () => null);
    const runOcr = vi.fn(
      async (
        _inputs: readonly OcrPageInput[],
        options?: { onProgress?: (progress: ExtractionProgress) => void }
      ) => {
        options?.onProgress?.({ phase: "ocr", ratio: 0 });
        options?.onProgress?.({ phase: "ocr", ratio: 1 });
        return ocrDocument();
      }
    );

    const provider = createLocalProvider({ runOcr, readImageSize });
    const onProgress = vi.fn();
    const file = new File(["x"], "invoice.png", { type: "image/png" });

    await provider.extract(file, onProgress);

    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { phase: "reading", ratio: 0 },
      { phase: "reading", ratio: OCR_START_RATIO },
      { phase: "ocr", ratio: OCR_START_RATIO },
      { phase: "ocr", ratio: MATCHING_START_RATIO },
      { phase: "matching", ratio: MATCHING_START_RATIO },
      { phase: "matching", ratio: 1 },
    ]);
  });

  it("emits reading:0 -> reading:0.9 -> matching:0.9 -> matching:1 on the text-layer route", async () => {
    const readPdfText = vi.fn(async () => pdfTextDocument([40, 0]));

    const provider = createLocalProvider({ readPdfText });
    const onProgress = vi.fn();
    const file = new File(["%PDF-1.4"], "invoice.pdf", {
      type: "application/pdf",
    });

    await provider.extract(file, onProgress);

    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { phase: "reading", ratio: 0 },
      { phase: "reading", ratio: MATCHING_START_RATIO },
      { phase: "matching", ratio: MATCHING_START_RATIO },
      { phase: "matching", ratio: 1 },
    ]);
  });
});

describe("createLocalProgressReporter", () => {
  it("never reports the same (phase, ratio) pair twice", () => {
    const onProgress = vi.fn();
    const report = createLocalProgressReporter(onProgress);

    report("reading", 0.5);
    report("reading", 0.5);

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({ phase: "reading", ratio: 0.5 });
  });

  it("reports a phase change even when the ratio does not move", () => {
    const onProgress = vi.fn();
    const report = createLocalProgressReporter(onProgress);

    report("reading", 0.9);
    report("matching", 0.9);

    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { phase: "reading", ratio: 0.9 },
      { phase: "matching", ratio: 0.9 },
    ]);
  });

  it("drops a ratio that would move backwards", () => {
    const onProgress = vi.fn();
    const report = createLocalProgressReporter(onProgress);

    report("ocr", 0.5);
    report("ocr", 0.3);

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith({ phase: "ocr", ratio: 0.5 });
  });

  it("clamps ratio into 0..1", () => {
    const onProgress = vi.fn();
    const report = createLocalProgressReporter(onProgress);

    report("matching", 1.5);

    expect(onProgress).toHaveBeenLastCalledWith({
      phase: "matching",
      ratio: 1,
    });
  });

  it("ends at exactly 1, whatever the last reported ratio was", () => {
    const onProgress = vi.fn();
    const report = createLocalProgressReporter(onProgress);

    report("matching", 0.9);
    report("matching", 1);

    expect(onProgress).toHaveBeenLastCalledWith({
      phase: "matching",
      ratio: 1,
    });
  });

  it("tolerates being constructed with no onProgress callback", () => {
    const report = createLocalProgressReporter();
    expect(() => report("reading", 0)).not.toThrow();
  });
});

describe("notFoundValue", () => {
  it("is the designed not-found shape", () => {
    expect(notFoundValue()).toEqual({
      value: "",
      confidence: 0,
      reason: NOT_FOUND_REASON,
      alternatives: [],
      bbox: null,
      page: 0,
    });
  });
});

describe("toExtractedValue", () => {
  it("maps a null candidate to notFoundValue()", () => {
    expect(toExtractedValue(null)).toEqual(notFoundValue());
  });

  it("maps a zero-word candidate to notFoundValue(), ignoring the candidate's own value and reason", () => {
    const candidate: FieldCandidate = {
      value: "should never surface",
      words: [],
      matchStrength: MatchStrength.LABEL_ADJACENT_PATTERN,
      reason: "should never surface either",
    };
    expect(toExtractedValue(candidate)).toEqual(notFoundValue());
  });

  it("composes confidence from the words, unions their bbox, takes the first word's page, and dedupes alternatives with the value removed", () => {
    const first = word({
      text: "INV",
      confidence: 0.9,
      bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
      page: 2,
      // Includes the candidate's own value — must be filtered out.
      alternatives: ["INV-1234", "1NV-1"],
    });
    const second = word({
      text: "-1234",
      confidence: 0.8,
      bbox: { x0: 10, y0: 5, x1: 20, y1: 15 },
      page: 2,
      // Repeats an alternative already offered by `first` — must be deduped.
      alternatives: ["1NV-1", "234"],
    });
    const candidate: FieldCandidate = {
      value: "INV-1234",
      words: [first, second],
      matchStrength: MatchStrength.LABEL_ADJACENT_PATTERN,
      reason: 'Matched label "Invoice #"',
    };

    const result = toExtractedValue(candidate);

    expect(result.value).toBe("INV-1234");
    expect(result.confidence).toBe(
      composeConfidence([first, second], MatchStrength.LABEL_ADJACENT_PATTERN)
    );
    expect(result.reason).toBe(candidate.reason);
    expect(result.bbox).toEqual({ x0: 0, y0: 0, x1: 20, y1: 15 });
    expect(result.page).toBe(2);
    expect(result.alternatives).toEqual(["1NV-1", "234"]);
  });

  it("a field is never omitted: a not-found candidate still yields a complete ExtractedValue", () => {
    const result = toExtractedValue(null);
    expect(Object.keys(result).sort()).toEqual(
      ["alternatives", "bbox", "confidence", "page", "reason", "value"].sort()
    );
  });
});

describe("LOCAL_PROVIDER_ID / LOCAL_PROVIDER_LABEL", () => {
  it("names the provider the registry expects", () => {
    const provider = createLocalProvider();
    expect(provider.id).toBe(LOCAL_PROVIDER_ID);
    expect(provider.id).toBe("local");
    expect(provider.label).toBe(LOCAL_PROVIDER_LABEL);
    expect(provider.label).toBe("On-device OCR");
  });
});

describe("rasterisePdfPages under Node", () => {
  it("throws an internal ExtractionError because there is no browser canvas", async () => {
    const bytes = await readFile(FIXTURE_PATH);

    const error = await captureError(rasterisePdfPages(new Uint8Array(bytes)));

    expect(error.code).toBe("internal");
  });
});
