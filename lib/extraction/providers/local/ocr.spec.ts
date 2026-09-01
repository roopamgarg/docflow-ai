import { describe, it, expect, vi } from "vitest";

import { isExtractionError } from "../../errors";
import lstmFixture from "./__fixtures__/tesseract-invoice-lstm.json";
import legacyFixture from "./__fixtures__/tesseract-invoice-legacy-choices.json";
import {
  blocksToWords,
  createOcrProgressReporter,
  DEFAULT_OCR_CORE_PATH,
  DEFAULT_OCR_LANG_PATH,
  DEFAULT_OCR_WORKER_PATH,
  isRecognitionStatus,
  MIN_WORD_CONFIDENCE,
  ocrPages,
  ocrProgressRatio,
  readableWordCount,
  scaleOcrConfidence,
  toBoundingBox,
  wordAlternatives,
  wordsExtent,
  type OcrLogEvent,
  type OcrPageInput,
  type OcrWorker,
  type OcrWorkerFactory,
  type TesseractBlock,
  type TesseractPageResult,
  type TesseractWord,
} from "./ocr";

/** The blocks of the captured LSTM fixture, narrowed to what the mapper reads. */
const LSTM_BLOCKS = lstmFixture.blocks as unknown as TesseractBlock[];
/** The blocks of the captured legacy (multi-choice) fixture. */
const LEGACY_BLOCKS = legacyFixture.blocks as unknown as TesseractBlock[];

describe("scaleOcrConfidence", () => {
  it("maps 0..100 onto 0..1", () => {
    expect(scaleOcrConfidence(95)).toBe(0.95);
  });

  it("maps 0 to 0", () => {
    expect(scaleOcrConfidence(0)).toBe(0);
  });

  it("clamps a negative score to 0", () => {
    expect(scaleOcrConfidence(-5)).toBe(0);
  });

  it("clamps a score above 100 to 1", () => {
    expect(scaleOcrConfidence(150)).toBe(1);
  });

  it("reads NaN as 0 rather than propagating it", () => {
    expect(scaleOcrConfidence(NaN)).toBe(0);
  });
});

describe("toBoundingBox", () => {
  it("normalises a bbox whose x0/x1 and y0/y1 arrive swapped", () => {
    const bbox = toBoundingBox({ x0: 50, y0: 10, x1: 20, y1: 5 });
    expect(bbox).toEqual({ x0: 20, y0: 5, x1: 50, y1: 10 });
  });
});

describe("wordAlternatives", () => {
  it("filters the word's own chosen text out of its choices", () => {
    const word: TesseractWord = {
      text: "Date:",
      confidence: 82,
      bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
      choices: [
        { text: "Date:", confidence: 80 },
        { text: "Data:", confidence: 10 },
      ],
    };
    expect(wordAlternatives(word)).toEqual(["Data:"]);
  });

  it("dedupes repeated choice text", () => {
    const word: TesseractWord = {
      text: "Foo",
      confidence: 80,
      bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
      choices: [
        { text: "Bar", confidence: 10 },
        { text: "Bar", confidence: 5 },
        { text: "Foo", confidence: 80 },
      ],
    };
    expect(wordAlternatives(word)).toEqual(["Bar"]);
  });

  it("returns undefined, not [], when there is nothing left to offer", () => {
    const word: TesseractWord = {
      text: "Foo",
      confidence: 80,
      bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
      choices: [{ text: "Foo", confidence: 80 }],
    };
    expect(wordAlternatives(word)).toBeUndefined();
  });
});

describe("readableWordCount", () => {
  it("counts only words at or above the 0.3 confidence floor", () => {
    const words = [
      { text: "a", confidence: 0.5, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, page: 0 },
      { text: "b", confidence: 0.29, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, page: 0 },
      { text: "c", confidence: 0.3, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, page: 0 },
      { text: "d", confidence: 0.1, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, page: 0 },
    ];
    expect(readableWordCount(words)).toBe(2);
    expect(MIN_WORD_CONFIDENCE).toBe(0.3);
  });
});

describe("wordsExtent", () => {
  it("is the smallest page containing every word of the LSTM fixture: 366x274", () => {
    const words = blocksToWords(LSTM_BLOCKS, 0);
    expect(wordsExtent(words)).toEqual({ width: 366, height: 274 });
  });
});

describe("blocksToWords", () => {
  it("walks the LSTM fixture into 11 words with the documented first word", () => {
    const words = blocksToWords(LSTM_BLOCKS, 0);
    expect(words).toHaveLength(11);
    expect(words[0]).toEqual({
      text: "Northwind",
      confidence: 0.95,
      bbox: { x0: 42, y0: 45, x1: 192, y1: 71 },
      page: 0,
    });
  });

  it("carries no alternatives for any word in the LSTM fixture", () => {
    const words = blocksToWords(LSTM_BLOCKS, 0);
    for (const word of words) {
      expect(word.alternatives).toBeUndefined();
    }
  });

  it("maps the legacy fixture's multi-choice words with alternatives", () => {
    const words = blocksToWords(LEGACY_BLOCKS, 0);
    expect(words).toHaveLength(11);

    expect(words[4].text).toBe("#:");
    expect(words[4].confidence).toBeCloseTo(0.68, 5);
    expect(words[4].alternatives).toEqual(["l:", "0:", "J:", "I:"]);

    expect(words[6].text).toBe("Date:");
    expect(words[6].alternatives).toEqual(["Data:"]);

    expect(words[7].alternatives).toEqual([
      "2026-03-14",
      "2026—03—14",
      "2026-03—14",
    ]);
  });

  it("returns [] for blocks: null", () => {
    expect(blocksToWords(null, 0)).toEqual([]);
  });

  it("returns [] for blocks: undefined", () => {
    expect(blocksToWords(undefined, 0)).toEqual([]);
  });

  it("drops words whose text is blank", () => {
    const blocks: TesseractBlock[] = [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [
                  { text: "   ", confidence: 90, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } },
                  { text: "Kept", confidence: 90, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } },
                ],
              },
            ],
          },
        ],
      },
    ];
    const words = blocksToWords(blocks, 0);
    expect(words).toHaveLength(1);
    expect(words[0].text).toBe("Kept");
  });
});

describe("isRecognitionStatus", () => {
  it("matches a per-page recognition status", () => {
    expect(isRecognitionStatus("recognizing text")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isRecognitionStatus("Recognizing Text")).toBe(true);
  });

  it("does not match a setup status", () => {
    expect(isRecognitionStatus("loading tesseract core")).toBe(false);
  });
});

describe("ocrProgressRatio", () => {
  it("weights a setup status by OCR_SETUP_WEIGHT", () => {
    const ratio = ocrProgressRatio(
      { status: "loading tesseract core", progress: 0.5 },
      0,
      2
    );
    expect(ratio).toBeCloseTo(0.05, 5);
  });

  it("page 0 of 2 finishing recognition lands at 0.1 + progress's share", () => {
    const ratio = ocrProgressRatio({ status: "recognizing text", progress: 0 }, 0, 2);
    expect(ratio).toBeCloseTo(0.1, 5);
  });

  it("page 0 of 2 at progress 1 lands at 0.55", () => {
    const ratio = ocrProgressRatio({ status: "recognizing text", progress: 1 }, 0, 2);
    expect(ratio).toBeCloseTo(0.55, 5);
  });

  it("page 1 of 2 at progress 0.5 lands at 0.775", () => {
    const ratio = ocrProgressRatio(
      { status: "recognizing text", progress: 0.5 },
      1,
      2
    );
    expect(ratio).toBeCloseTo(0.775, 5);
  });

  it("reports setup-complete when pageCount is 0", () => {
    const ratio = ocrProgressRatio({ status: "recognizing text", progress: 1 }, 0, 0);
    expect(ratio).toBeCloseTo(0.1, 5);
  });
});

describe("createOcrProgressReporter", () => {
  it("reports a strictly increasing sequence that ends at exactly 1", () => {
    const events: number[] = [];
    const reporter = createOcrProgressReporter(2, (p) => events.push(p.ratio));

    reporter.log({ status: "loading tesseract core", progress: 0.5 });
    reporter.page(0);
    reporter.log({ status: "recognizing text", progress: 0 });
    reporter.log({ status: "recognizing text", progress: 0.5 });
    reporter.log({ status: "recognizing text", progress: 1 });
    reporter.page(1);
    // Per-page progress restarts at 0 in real tesseract logs; must not walk
    // the bar backwards, so this duplicate-or-lower ratio must be swallowed.
    reporter.log({ status: "recognizing text", progress: 0 });
    reporter.log({ status: "recognizing text", progress: 0.5 });
    reporter.finish();

    expect(events.length).toBeGreaterThan(1);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]).toBeGreaterThan(events[i - 1]);
    }
    expect(events[events.length - 1]).toBe(1);
    expect(reporter.ratio).toBe(1);
  });

  it("finish() emits no duplicate when the last log already reached 1", () => {
    const events: number[] = [];
    const reporter = createOcrProgressReporter(1, (p) => events.push(p.ratio));

    reporter.page(0);
    reporter.log({ status: "recognizing text", progress: 1 });
    expect(reporter.ratio).toBe(1);
    const countBeforeFinish = events.length;

    reporter.finish();

    expect(events.length).toBe(countBeforeFinish);
    expect(reporter.ratio).toBe(1);
  });
});

describe("worker asset paths", () => {
  it("point at the vendored public/tesseract/ assets, not a CDN", () => {
    expect(DEFAULT_OCR_WORKER_PATH.startsWith("/tesseract")).toBe(true);
    expect(DEFAULT_OCR_CORE_PATH.startsWith("/tesseract")).toBe(true);
    expect(DEFAULT_OCR_LANG_PATH.startsWith("/tesseract")).toBe(true);

    for (const path of [
      DEFAULT_OCR_WORKER_PATH,
      DEFAULT_OCR_CORE_PATH,
      DEFAULT_OCR_LANG_PATH,
    ]) {
      expect(path.startsWith("http")).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * `ocrPages` via the `createWorker` injection seam — no real OCR.
 * ------------------------------------------------------------------ */

const GOOD_RESULT: { data: TesseractPageResult } = {
  data: {
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [
                  {
                    text: "Hello",
                    confidence: 90,
                    bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

const NO_WORDS_RESULT: { data: TesseractPageResult } = {
  data: { blocks: [] },
};

const SUB_FLOOR_RESULT: { data: TesseractPageResult } = {
  data: {
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [
                  {
                    text: "faint",
                    confidence: 10, // 0.1, below MIN_WORD_CONFIDENCE (0.3)
                    bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

function mkInput(): OcrPageInput {
  return { source: new Uint8Array([1, 2, 3]), width: 100, height: 100 };
}

/** A fake worker whose `recognize`/`terminate` are spies, wrapped by a factory. */
function fakeWorkerFactory(
  recognize: OcrWorker["recognize"],
  terminate: OcrWorker["terminate"] = vi.fn().mockResolvedValue(undefined)
): { factory: OcrWorkerFactory; terminate: typeof terminate } {
  const factory: OcrWorkerFactory = vi.fn(async () => ({ recognize, terminate }));
  return { factory, terminate };
}

describe("ocrPages", () => {
  it("calls recognize with the {blocks: true} output request", async () => {
    const recognize = vi.fn().mockResolvedValue(GOOD_RESULT);
    const { factory } = fakeWorkerFactory(recognize);
    const input = mkInput();

    await ocrPages([input], { createWorker: factory });

    expect(recognize).toHaveBeenCalledWith(input.source, {}, { blocks: true });
  });

  it("creates exactly one worker for a multi-page document", async () => {
    const recognize = vi.fn().mockResolvedValue(GOOD_RESULT);
    const { factory } = fakeWorkerFactory(recognize);

    await ocrPages([mkInput(), mkInput(), mkInput()], { createWorker: factory });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(recognize).toHaveBeenCalledTimes(3);
  });

  it("terminates the worker exactly once on success", async () => {
    const recognize = vi.fn().mockResolvedValue(GOOD_RESULT);
    const { factory, terminate } = fakeWorkerFactory(recognize);

    await ocrPages([mkInput(), mkInput()], { createWorker: factory });

    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("raises no_text_found and still terminates once when blocks is empty", async () => {
    const recognize = vi.fn().mockResolvedValue(NO_WORDS_RESULT);
    const { factory, terminate } = fakeWorkerFactory(recognize);

    let caught: unknown;
    try {
      await ocrPages([mkInput()], { createWorker: factory });
    } catch (error) {
      caught = error;
    }

    expect(isExtractionError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe("no_text_found");
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("raises no_text_found and still terminates once when every word is sub-floor", async () => {
    const recognize = vi.fn().mockResolvedValue(SUB_FLOOR_RESULT);
    const { factory, terminate } = fakeWorkerFactory(recognize);

    let caught: unknown;
    try {
      await ocrPages([mkInput()], { createWorker: factory });
    } catch (error) {
      caught = error;
    }

    expect(isExtractionError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe("no_text_found");
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("raises unreadable and still terminates once when recognize rejects", async () => {
    const recognize = vi.fn().mockRejectedValue(new Error("bad image bytes"));
    const { factory, terminate } = fakeWorkerFactory(recognize);

    let caught: unknown;
    try {
      await ocrPages([mkInput()], { createWorker: factory });
    } catch (error) {
      caught = error;
    }

    expect(isExtractionError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe("unreadable");
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("raises internal when the worker factory itself rejects", async () => {
    const factory: OcrWorkerFactory = vi.fn().mockRejectedValue(new Error("no wasm"));

    let caught: unknown;
    try {
      await ocrPages([mkInput()], { createWorker: factory });
    } catch (error) {
      caught = error;
    }

    expect(isExtractionError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe("internal");
  });

  it("raises internal for an empty inputs array without creating a worker", async () => {
    const factory: OcrWorkerFactory = vi.fn().mockResolvedValue({
      recognize: vi.fn(),
      terminate: vi.fn(),
    });

    let caught: unknown;
    try {
      await ocrPages([], { createWorker: factory });
    } catch (error) {
      caught = error;
    }

    expect(isExtractionError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe("internal");
    expect(factory).not.toHaveBeenCalled();
  });

  it("emits a monotonically increasing progress ratio ending at 1 across a multi-page document", async () => {
    const events: number[] = [];
    let logger: (event: OcrLogEvent) => void = () => {};

    const recognize = vi.fn(async () => {
      logger({ status: "recognizing text", progress: 1 });
      return GOOD_RESULT;
    });
    const terminate = vi.fn().mockResolvedValue(undefined);
    const factory: OcrWorkerFactory = vi.fn(async (_language, _engineMode, options) => {
      logger = options.logger;
      return { recognize, terminate };
    });

    await ocrPages([mkInput(), mkInput()], {
      createWorker: factory,
      onProgress: (progress) => events.push(progress.ratio),
    });

    expect(events.length).toBeGreaterThan(1);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]).toBeGreaterThan(events[i - 1]);
    }
    expect(events[events.length - 1]).toBe(1);
  });
});
