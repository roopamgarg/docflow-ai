import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import { isExtractionError } from "../../errors";
import {
  countTextLayerCharacters,
  extractPdfText,
  pdfPointToPagePixel,
  textItemBoundingBox,
  textItemToWords,
  totalCharCount,
  type PdfViewportGeometry,
} from "./pdf-text";

/** Scale-1 viewport for an upright US-Letter page, as pdf.js reports it. */
const US_LETTER_VIEWPORT: PdfViewportGeometry = {
  transform: [1, 0, 0, -1, 0, 792],
  width: 612,
  height: 792,
};

const FIXTURE_PATH = fileURLToPath(
  new URL("./__fixtures__/sample-invoice.pdf", import.meta.url)
);

describe("pdfPointToPagePixel", () => {
  it("flips a mid-page PDF y through the US-Letter viewport transform", () => {
    const [x, y] = pdfPointToPagePixel(72, 700, US_LETTER_VIEWPORT.transform);
    expect(x).toBe(72);
    expect(y).toBe(92);
  });

  it("mirror-bug guard: the flipped y must not equal the untouched PDF y", () => {
    // A conversion that forgot to flip (or copied `y` straight through) would
    // silently produce y === 700 here instead of 92 — this is the exact
    // failure mode that later shows up as vertically mirrored highlights.
    const [, y] = pdfPointToPagePixel(72, 700, US_LETTER_VIEWPORT.transform);
    expect(y).not.toBe(700);
  });

  it("maps the PDF origin (y=0, page bottom) to the pixel bottom", () => {
    const [x, y] = pdfPointToPagePixel(72, 0, US_LETTER_VIEWPORT.transform);
    expect(x).toBe(72);
    expect(y).toBe(792);
  });
});

describe("textItemBoundingBox", () => {
  it("matches the hand-computed worked example from the module docs", () => {
    const bbox = textItemBoundingBox(
      { transform: [12, 0, 0, 12, 72, 700], width: 92.04, height: 12 },
      US_LETTER_VIEWPORT
    );
    expect(bbox.x0).toBeCloseTo(72, 5);
    expect(bbox.y0).toBeCloseTo(80, 5);
    expect(bbox.x1).toBeCloseTo(164.04, 5);
    expect(bbox.y1).toBeCloseTo(92, 5);
  });

  it("keeps x0 <= x1 and y0 <= y1 under a 90-degree rotated viewport transform", () => {
    // Synthetic (not pdf.js-derived) rotated matrix: only used to exercise the
    // min/max reduction across corners for a transform that isn't axis-upright.
    const rotated90: PdfViewportGeometry = {
      transform: [0, 1, 1, 0, 0, 0],
      width: 792,
      height: 612,
    };
    const bbox = textItemBoundingBox(
      { transform: [12, 0, 0, 12, 72, 700], width: 92.04, height: 12 },
      rotated90
    );
    expect(bbox.x0).toBeLessThanOrEqual(bbox.x1);
    expect(bbox.y0).toBeLessThanOrEqual(bbox.y1);
  });

  it("keeps x0 <= x1 and y0 <= y1 under a 180-degree rotated viewport transform", () => {
    const rotated180: PdfViewportGeometry = {
      transform: [-1, 0, 0, 1, 612, 0],
      width: 612,
      height: 792,
    };
    const bbox = textItemBoundingBox(
      { transform: [12, 0, 0, 12, 72, 700], width: 92.04, height: 12 },
      rotated180
    );
    expect(bbox.x0).toBeLessThanOrEqual(bbox.x1);
    expect(bbox.y0).toBeLessThanOrEqual(bbox.y1);
  });

  it("falls back to the transform's own scale when width and height are 0", () => {
    // width/height 0 forces runWidth/runHeight to fall back to
    // hypot(a,b) / hypot(c,d) — i.e. behave as if width: 12, height: 12 here.
    const bbox = textItemBoundingBox(
      { transform: [12, 0, 0, 12, 72, 700], width: 0, height: 0 },
      US_LETTER_VIEWPORT
    );
    expect(bbox.x0).toBeCloseTo(72, 5);
    expect(bbox.y0).toBeCloseTo(80, 5);
    expect(bbox.x1).toBeCloseTo(84, 5);
    expect(bbox.y1).toBeCloseTo(92, 5);
  });

  it("clamps a box that runs off the left edge of the page into 0..width", () => {
    const bbox = textItemBoundingBox(
      { transform: [12, 0, 0, 12, -50, 700], width: 92.04, height: 12 },
      US_LETTER_VIEWPORT
    );
    expect(bbox.x0).toBe(0);
    expect(bbox.x1).toBeCloseTo(42.04, 5);
  });

  it("clamps a box that runs off the right edge of the page into 0..width", () => {
    const bbox = textItemBoundingBox(
      { transform: [12, 0, 0, 12, 700, 700], width: 92.04, height: 12 },
      US_LETTER_VIEWPORT
    );
    expect(bbox.x0).toBeLessThanOrEqual(US_LETTER_VIEWPORT.width);
    expect(bbox.x1).toBe(US_LETTER_VIEWPORT.width);
  });
});

describe("textItemToWords", () => {
  const item = {
    str: "Invoice INV-1024",
    transform: [12, 0, 0, 12, 72, 700],
    width: 92.04,
    height: 12,
  };

  it("splits the run into words apportioned by character offset", () => {
    const words = textItemToWords(item, US_LETTER_VIEWPORT, 0);
    expect(words).toHaveLength(2);

    expect(words[0].text).toBe("Invoice");
    expect(words[0].bbox.x0).toBeCloseTo(72, 5);
    expect(words[0].bbox.y0).toBeCloseTo(80, 5);
    expect(words[0].bbox.x1).toBeCloseTo(112.2675, 5);
    expect(words[0].bbox.y1).toBeCloseTo(92, 5);

    expect(words[1].text).toBe("INV-1024");
    expect(words[1].bbox.x0).toBeCloseTo(118.02, 5);
    expect(words[1].bbox.y0).toBeCloseTo(80, 5);
    expect(words[1].bbox.x1).toBeCloseTo(164.04, 5);
    expect(words[1].bbox.y1).toBeCloseTo(92, 5);
  });

  it("reports confidence === 1 and the given page index for every word", () => {
    const words = textItemToWords(item, US_LETTER_VIEWPORT, 3);
    expect(words.length).toBeGreaterThan(0);
    for (const word of words) {
      expect(word.confidence).toBe(1);
      expect(word.page).toBe(3);
    }
  });

  it("returns no words for an empty run", () => {
    const words = textItemToWords(
      { ...item, str: "" },
      US_LETTER_VIEWPORT,
      0
    );
    expect(words).toEqual([]);
  });

  it("returns no words for a whitespace-only run", () => {
    const words = textItemToWords(
      { ...item, str: "   \n\t " },
      US_LETTER_VIEWPORT,
      0
    );
    expect(words).toEqual([]);
  });
});

describe("countTextLayerCharacters", () => {
  it("counts non-whitespace characters only", () => {
    expect(countTextLayerCharacters(["a b", "  \n ", "cd"])).toBe(4);
  });

  it("returns 0 for no strings", () => {
    expect(countTextLayerCharacters([])).toBe(0);
  });
});

describe("extractPdfText", () => {
  it("reads the committed fixture into pages of words with the documented shape", async () => {
    const bytes = await readFile(FIXTURE_PATH);
    const document = await extractPdfText(new Uint8Array(bytes));

    expect(document.source).toBe("pdf-text");
    expect(document.pages).toHaveLength(3);

    for (const page of document.pages) {
      expect(page.width).toBe(612);
      expect(page.height).toBe(792);
    }

    expect(document.pages.map((page) => page.index)).toEqual([0, 1, 2]);
    expect(document.pages.map((page) => page.charCount)).toEqual([
      49, 16, 0,
    ]);
    expect(document.pages.map((page) => page.words.length)).toEqual([
      7, 3, 0,
    ]);

    for (const page of document.pages) {
      for (const word of page.words) {
        expect(word.confidence).toBe(1);
        expect(word.page).toBe(page.index);
      }
    }

    expect(totalCharCount(document)).toBe(65);
  });

  it("does not detach or mutate the caller's buffer", async () => {
    const fileBytes = await readFile(FIXTURE_PATH);
    const bytes = new Uint8Array(fileBytes);
    const snapshot = Uint8Array.from(bytes);

    await extractPdfText(bytes);

    // If pdf.js had taken ownership of (rather than copied) the buffer, a
    // detach would zero its length; a mutation would change its contents.
    expect(bytes.byteLength).toBe(snapshot.byteLength);
    expect(bytes).toEqual(snapshot);
  });

  it("rejects unreadable bytes with an ExtractionError coded 'unreadable'", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    let caught: unknown;
    try {
      await extractPdfText(garbage);
    } catch (error) {
      caught = error;
    }

    expect(isExtractionError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe("unreadable");
  });
});
