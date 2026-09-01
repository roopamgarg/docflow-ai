import { describe, it, expect } from "vitest";

import {
  clampScale,
  steppedScale,
  canZoom,
  fitScale,
  formatZoom,
  clampPage,
  MIN_SCALE,
  MAX_SCALE,
} from "./viewer-scale";

describe("clampScale", () => {
  it("clamps below the floor up to MIN_SCALE", () => {
    expect(clampScale(0.1)).toBe(0.25);
  });

  it("clamps above the ceiling down to MAX_SCALE", () => {
    expect(clampScale(5)).toBe(MAX_SCALE);
  });

  it("leaves an in-range scale untouched", () => {
    expect(clampScale(1)).toBe(1);
  });

  it("falls back to 1 for non-finite input", () => {
    expect(clampScale(NaN)).toBe(1);
    expect(clampScale(Infinity)).toBe(1);
    expect(clampScale(-Infinity)).toBe(1);
  });

  it("tidies binary-float noise to 4 decimal places", () => {
    expect(clampScale(0.7500000000000001)).toBe(0.75);
  });

  it("holds the exact bounds", () => {
    expect(clampScale(MIN_SCALE)).toBe(MIN_SCALE);
    expect(clampScale(MAX_SCALE)).toBe(MAX_SCALE);
  });
});

describe("steppedScale", () => {
  it("steps up from a whole scale", () => {
    expect(steppedScale(1, 1)).toBe(1.25);
  });

  it("steps down off a fitted fraction onto the grid", () => {
    expect(steppedScale(0.83, -1)).toBe(0.75);
  });

  it("clamps at the top when already at MAX_SCALE", () => {
    expect(steppedScale(4, 1)).toBe(4);
  });

  it("clamps at the bottom when already at MIN_SCALE", () => {
    expect(steppedScale(0.25, -1)).toBe(0.25);
  });

  it("clamps stepping up from just below the ceiling", () => {
    expect(steppedScale(3.75, 1)).toBe(4);
  });

  it("clamps stepping down from just above the floor", () => {
    expect(steppedScale(0.5, -1)).toBe(0.25);
  });

  it("steps up from an exact grid value", () => {
    expect(steppedScale(0.75, 1)).toBe(1);
  });

  it("steps down from an exact grid value", () => {
    expect(steppedScale(1, -1)).toBe(0.75);
  });
});

describe("canZoom", () => {
  it("is false zooming in at the ceiling", () => {
    expect(canZoom(4, 1)).toBe(false);
  });

  it("is true zooming out from the ceiling", () => {
    expect(canZoom(4, -1)).toBe(true);
  });

  it("is false zooming out at the floor", () => {
    expect(canZoom(0.25, -1)).toBe(false);
  });

  it("is true zooming in from the floor", () => {
    expect(canZoom(0.25, 1)).toBe(true);
  });

  it("is true in either direction away from the bounds", () => {
    expect(canZoom(1, 1)).toBe(true);
    expect(canZoom(1, -1)).toBe(true);
  });
});

describe("fitScale", () => {
  it("computes the width ratio", () => {
    expect(fitScale(600, 612)).toBeCloseTo(0.9804, 4);
  });

  it("falls back to 1 for a zero-width container", () => {
    expect(fitScale(0, 612)).toBe(1);
  });

  it("clamps a huge container down to MAX_SCALE", () => {
    expect(fitScale(3000, 612)).toBe(4);
  });

  it("falls back to 1 for a negative container width", () => {
    expect(fitScale(-100, 612)).toBe(1);
  });

  it("falls back to 1 for a zero or negative page width", () => {
    expect(fitScale(600, 0)).toBe(1);
    expect(fitScale(600, -50)).toBe(1);
  });

  it("falls back to 1 for a non-finite container width", () => {
    expect(fitScale(NaN, 612)).toBe(1);
  });

  it("clamps a tiny container up to MIN_SCALE", () => {
    expect(fitScale(1, 612)).toBe(0.25);
  });
});

describe("formatZoom", () => {
  it("rounds to the nearest whole percentage", () => {
    expect(formatZoom(0.835)).toBe("84%");
  });

  it("formats a scale of 1 as 100%", () => {
    expect(formatZoom(1)).toBe("100%");
  });

  it("clamps above the ceiling before formatting", () => {
    expect(formatZoom(4.5)).toBe("400%");
  });

  it("clamps below the floor before formatting", () => {
    expect(formatZoom(0.1)).toBe("25%");
  });
});

describe("clampPage", () => {
  it("clamps a page below 1 up to 1", () => {
    expect(clampPage(0, 3)).toBe(1);
  });

  it("clamps a page above the total down to the total", () => {
    expect(clampPage(9, 3)).toBe(3);
  });

  it("leaves an in-range page untouched", () => {
    expect(clampPage(2, 3)).toBe(2);
  });

  it("rounds a fractional page", () => {
    expect(clampPage(1.6, 3)).toBe(2);
  });

  it("falls back to 1 for a non-finite page", () => {
    expect(clampPage(NaN, 3)).toBe(1);
  });

  it("treats a totalPages of 0 as a single-page document", () => {
    expect(clampPage(2, 0)).toBe(1);
  });

  it("clamps a deeply negative page up to 1", () => {
    expect(clampPage(-5, 3)).toBe(1);
  });
});
