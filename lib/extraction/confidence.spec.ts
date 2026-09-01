import { describe, it, expect } from "vitest";
import {
  composeConfidence,
  tierFor,
  MatchStrength,
  CONFIDENCE_THRESHOLDS,
} from "./confidence";

describe("tierFor", () => {
  it("returns high at confidence 1", () => {
    expect(tierFor(1)).toBe("high");
  });

  it("returns high at the 0.95 boundary", () => {
    expect(tierFor(0.95)).toBe("high");
  });

  it("returns medium just below the high boundary (0.949)", () => {
    expect(tierFor(0.949)).toBe("medium");
  });

  it("returns medium at the 0.8 boundary", () => {
    expect(tierFor(0.8)).toBe("medium");
  });

  it("returns low just below the medium boundary (0.799)", () => {
    expect(tierFor(0.799)).toBe("low");
  });

  it("returns low for a tiny positive confidence (0.0001)", () => {
    expect(tierFor(0.0001)).toBe("low");
  });

  it("returns not-found at confidence 0", () => {
    expect(tierFor(0)).toBe("not-found");
  });

  it("returns not-found for a negative confidence", () => {
    expect(tierFor(-0.5)).toBe("not-found");
  });

  it("returns not-found for NaN", () => {
    expect(tierFor(NaN)).toBe("not-found");
  });

  it("matches the documented threshold constants", () => {
    expect(CONFIDENCE_THRESHOLDS.HIGH).toBe(0.95);
    expect(CONFIDENCE_THRESHOLDS.MEDIUM).toBe(0.8);
  });
});

describe("composeConfidence", () => {
  it("multiplies mean word confidence by match strength", () => {
    // mean([0.9, 0.8]) = 0.85; 0.85 * 0.85 = 0.7225
    expect(
      composeConfidence([{ confidence: 0.9 }, { confidence: 0.8 }], 0.85)
    ).toBeCloseTo(0.7225, 10);
  });

  it("returns 0 for an empty word list, not NaN", () => {
    const result = composeConfidence([], MatchStrength.LABEL_ADJACENT_PATTERN);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });

  it("returns 0 for an empty word list even with a 0 match strength", () => {
    const result = composeConfidence([], MatchStrength.NOT_FOUND);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });

  describe("reduces to match strength alone when every word confidence is 1.0 (pdf-text)", () => {
    const pdfTextWords = [
      { confidence: 1.0 },
      { confidence: 1.0 },
      { confidence: 1.0 },
    ];

    it("LABEL_ADJACENT_PATTERN (1.0)", () => {
      expect(
        composeConfidence(pdfTextWords, MatchStrength.LABEL_ADJACENT_PATTERN)
      ).toBe(MatchStrength.LABEL_ADJACENT_PATTERN);
    });

    it("LABEL_OR_PATTERN_ONLY (0.85)", () => {
      expect(
        composeConfidence(pdfTextWords, MatchStrength.LABEL_OR_PATTERN_ONLY)
      ).toBe(MatchStrength.LABEL_OR_PATTERN_ONLY);
    });

    it("POSITIONAL_HEURISTIC (0.6)", () => {
      expect(
        composeConfidence(pdfTextWords, MatchStrength.POSITIONAL_HEURISTIC)
      ).toBe(MatchStrength.POSITIONAL_HEURISTIC);
    });

    it("NOT_FOUND (0.0)", () => {
      expect(
        composeConfidence(pdfTextWords, MatchStrength.NOT_FOUND)
      ).toBe(MatchStrength.NOT_FOUND);
    });

    it("holds for a single pdf-text word too", () => {
      expect(
        composeConfidence(
          [{ confidence: 1.0 }],
          MatchStrength.LABEL_OR_PATTERN_ONLY
        )
      ).toBe(MatchStrength.LABEL_OR_PATTERN_ONLY);
    });
  });
});
