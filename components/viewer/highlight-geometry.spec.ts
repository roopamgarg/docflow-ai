import { describe, it, expect } from "vitest";

import { highlightRect, MIN_HIGHLIGHT_PX } from "./highlight-geometry";
import type { HighlightRectInput } from "./highlight-geometry";
import type { BoundingBox } from "@/lib/extraction/types";

/* ------------------------------------------------------------------ *
 * The measured routes — see the module doc's coordinate-space table.
 * These are the exact values the implementer verified in the browser.
 * ------------------------------------------------------------------ */

describe("highlightRect / measured routes", () => {
  it("places an uploaded-image box (ratio 1) at scale 1", () => {
    const bbox: BoundingBox = { x0: 42, y0: 44, x1: 366, y1: 78 };

    const rect = highlightRect({
      bbox,
      source: { width: 900, height: 360 },
      page: { width: 900, height: 360 },
      scale: 1,
    });

    expect(rect).not.toBeNull();
    expect(rect!.left).toBeCloseTo(42);
    expect(rect!.top).toBeCloseTo(44);
    expect(rect!.width).toBeCloseTo(324);
    expect(rect!.height).toBeCloseTo(34);
  });

  it("scales the same box by a 1.5x zoom", () => {
    const bbox: BoundingBox = { x0: 42, y0: 44, x1: 366, y1: 78 };

    const rect = highlightRect({
      bbox,
      source: { width: 900, height: 360 },
      page: { width: 900, height: 360 },
      scale: 1.5,
    });

    expect(rect).not.toBeNull();
    expect(rect!.left).toBeCloseTo(63);
    expect(rect!.top).toBeCloseTo(66);
    expect(rect!.width).toBeCloseTo(486);
    expect(rect!.height).toBeCloseTo(51);
  });

  // The highest-value assertion in this ticket. A scanned PDF is rasterised at
  // DEFAULT_RASTER_SCALE (2x) before OCR, so tesseract reports boxes in that
  // 1224x1584 bitmap space, while the viewer always draws the original
  // 612x792 sheet. Without dividing through by the source page's own
  // geometry, every highlight on this route would land at twice its true
  // size in the top-left quadrant of the page — the real 2x bug this seam
  // caught on the scanned-PDF route.
  it("normalises a scanned-PDF (OCR) box measured on a 2x-rasterised page down to the drawn 612x792 sheet", () => {
    const bbox: BoundingBox = { x0: 122, y0: 125, x1: 512, y1: 166 };

    const rect = highlightRect({
      bbox,
      source: { width: 1224, height: 1584 },
      page: { width: 612, height: 792 },
      scale: 1,
    });

    expect(rect).not.toBeNull();
    expect(rect!.left).toBeCloseTo(61);
    expect(rect!.top).toBeCloseTo(62.5);
    expect(rect!.width).toBeCloseTo(195);
    expect(rect!.height).toBeCloseTo(20.5);
  });

  it("normalises each axis independently when the two ratios differ", () => {
    const bbox: BoundingBox = { x0: 100, y0: 100, x1: 200, y1: 200 };

    const rect = highlightRect({
      bbox,
      source: { width: 1000, height: 400 },
      page: { width: 500, height: 100 },
      scale: 1,
    });

    expect(rect).not.toBeNull();
    expect(rect!.left).toBeCloseTo(50);
    expect(rect!.top).toBeCloseTo(25);
    expect(rect!.width).toBeCloseTo(50);
    expect(rect!.height).toBeCloseTo(25);
  });
});

/* ------------------------------------------------------------------ *
 * source fallback — missing or degenerate geometry degrades to ratio 1
 * ------------------------------------------------------------------ */

describe("highlightRect / source fallback", () => {
  const bbox: BoundingBox = { x0: 10, y0: 20, x1: 40, y1: 50 };
  const page = { width: 300, height: 150 };

  it("falls back to ratio 1 when source is omitted", () => {
    const rect = highlightRect({ bbox, page, scale: 1 });

    expect(rect).toEqual({ left: 10, top: 20, width: 30, height: 30 });
  });

  it("falls back to ratio 1 when source is explicitly null", () => {
    const rect = highlightRect({ bbox, source: null, page, scale: 1 });

    expect(rect).toEqual({ left: 10, top: 20, width: 30, height: 30 });
  });

  it("falls back to ratio 1 when source has a zero or negative dimension", () => {
    const rect = highlightRect({
      bbox,
      source: { width: 0, height: -10 },
      page,
      scale: 1,
    });

    expect(rect).toEqual({ left: 10, top: 20, width: 30, height: 30 });
  });
});

/* ------------------------------------------------------------------ *
 * null guards — page/scale of zero, and non-finite input
 * ------------------------------------------------------------------ */

describe("highlightRect / null guards", () => {
  const bbox: BoundingBox = { x0: 10, y0: 10, x1: 50, y1: 50 };
  const page = { width: 200, height: 100 };

  it("returns null for a zero page width", () => {
    expect(
      highlightRect({ bbox, page: { width: 0, height: 100 }, scale: 1 })
    ).toBeNull();
  });

  it("returns null for a zero page height", () => {
    expect(
      highlightRect({ bbox, page: { width: 200, height: 0 }, scale: 1 })
    ).toBeNull();
  });

  it("returns null for a negative page dimension", () => {
    expect(
      highlightRect({ bbox, page: { width: -200, height: 100 }, scale: 1 })
    ).toBeNull();
  });

  it("returns null for a zero scale", () => {
    expect(highlightRect({ bbox, page, scale: 0 })).toBeNull();
  });

  it("returns null for a negative scale", () => {
    expect(highlightRect({ bbox, page, scale: -1 })).toBeNull();
  });

  it("does not reject a tiny positive scale, just above the guard", () => {
    expect(highlightRect({ bbox, page, scale: 0.0001 })).not.toBeNull();
  });

  it("returns null for a non-finite page dimension", () => {
    expect(
      highlightRect({ bbox, page: { width: NaN, height: 100 }, scale: 1 })
    ).toBeNull();
    expect(
      highlightRect({
        bbox,
        page: { width: Infinity, height: 100 },
        scale: 1,
      })
    ).toBeNull();
  });

  it("returns null for a non-finite scale", () => {
    expect(highlightRect({ bbox, page, scale: NaN })).toBeNull();
    expect(highlightRect({ bbox, page, scale: Infinity })).toBeNull();
  });

  it("returns null for a non-finite bbox coordinate", () => {
    expect(
      highlightRect({
        bbox: { x0: NaN, y0: 10, x1: 50, y1: 50 },
        page,
        scale: 1,
      })
    ).toBeNull();
    expect(
      highlightRect({
        bbox: { x0: 10, y0: 10, x1: Infinity, y1: 50 },
        page,
        scale: 1,
      })
    ).toBeNull();
  });

  it("does not reject an unusually large but finite bbox coordinate", () => {
    const rect = highlightRect({
      bbox: { x0: 10, y0: 10, x1: Number.MAX_VALUE, y1: 50 },
      page,
      scale: 1,
    });

    // Clamped into the sheet rather than throwing or producing NaN/Infinity.
    expect(rect).not.toBeNull();
    expect(Number.isFinite(rect!.width)).toBe(true);
  });

  it("returns null for a null bbox instead of throwing", () => {
    expect(
      highlightRect({
        bbox: null as unknown as BoundingBox,
        page,
        scale: 1,
      })
    ).toBeNull();
  });

  it("returns null for an absent bbox instead of throwing", () => {
    const input = { page, scale: 1 } as unknown as HighlightRectInput;
    expect(highlightRect(input)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * clamping and the x0<=x1 / y0<=y1 invariant
 * ------------------------------------------------------------------ */

describe("highlightRect / clamping", () => {
  it("clamps a box that overflows the sheet's right/bottom edge", () => {
    const rect = highlightRect({
      bbox: { x0: 80, y0: 40, x1: 150, y1: 100 },
      page: { width: 100, height: 50 },
      scale: 1,
    });

    expect(rect).toEqual({ left: 80, top: 40, width: 20, height: 10 });
  });

  it("clamps a box that overflows past the sheet's top/left edge", () => {
    const rect = highlightRect({
      bbox: { x0: -50, y0: -20, x1: 30, y1: 10 },
      page: { width: 100, height: 80 },
      scale: 1,
    });

    expect(rect).toEqual({ left: 0, top: 0, width: 30, height: 10 });
  });

  it("does not invert into a negative width/height when x0>x1 or y0>y1", () => {
    const rect = highlightRect({
      bbox: { x0: 100, y0: 100, x1: 20, y1: 20 },
      page: { width: 200, height: 200 },
      scale: 1,
    });

    expect(rect).toEqual({ left: 20, top: 20, width: 80, height: 80 });
  });
});

/* ------------------------------------------------------------------ *
 * MIN_HIGHLIGHT_PX floor
 * ------------------------------------------------------------------ */

describe("highlightRect / MIN_HIGHLIGHT_PX floor", () => {
  it("is 3", () => {
    expect(MIN_HIGHLIGHT_PX).toBe(3);
  });

  it("floors a degenerate zero-width/zero-height bbox up to MIN_HIGHLIGHT_PX in both axes", () => {
    const rect = highlightRect({
      bbox: { x0: 50, y0: 50, x1: 50, y1: 50 },
      page: { width: 200, height: 200 },
      scale: 1,
    });

    expect(rect).not.toBeNull();
    expect(rect!.width).toBe(MIN_HIGHLIGHT_PX);
    expect(rect!.height).toBe(MIN_HIGHLIGHT_PX);
  });

  it("floors a near-zero-width bbox up to MIN_HIGHLIGHT_PX rather than leaving a sub-pixel sliver", () => {
    const rect = highlightRect({
      bbox: { x0: 50, y0: 50, x1: 50.0002, y1: 50.0002 },
      page: { width: 200, height: 200 },
      scale: 1,
    });

    expect(rect).not.toBeNull();
    expect(rect!.width).toBe(MIN_HIGHLIGHT_PX);
    expect(rect!.height).toBe(MIN_HIGHLIGHT_PX);
  });

  it("leaves a box already wider/taller than the floor untouched", () => {
    const rect = highlightRect({
      bbox: { x0: 0, y0: 0, x1: 6, y1: 6 },
      page: { width: 100, height: 100 },
      scale: 1,
    });

    expect(rect).toEqual({ left: 0, top: 0, width: 6, height: 6 });
  });
});
