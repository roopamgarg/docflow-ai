import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  confidencePercent,
  confidenceTone,
  CONFIDENCE_TONES,
  isLineItemField,
  groupReviewFields,
  reviewedSummary,
  reviewedPercent,
} from "./field-display";
import type { ExtractedField } from "@/lib/extraction/types";

function field(id: string, overrides: Partial<ExtractedField> = {}): ExtractedField {
  return {
    id,
    label: id,
    value: "",
    confidence: 0,
    reason: "",
    alternatives: [],
    bbox: null,
    page: 0,
    originalValue: "",
    approved: false,
    edited: false,
    ...overrides,
  };
}

describe("confidencePercent", () => {
  it("rounds a mid-range confidence", () => {
    expect(confidencePercent(0.9549)).toBe(95);
  });

  it("clamps above 1", () => {
    expect(confidencePercent(1.2)).toBe(100);
  });

  it("degrades NaN to 0 rather than rendering NaN%", () => {
    expect(confidencePercent(NaN)).toBe(0);
  });

  it("returns 0 at 0", () => {
    expect(confidencePercent(0)).toBe(0);
  });

  it("agrees with the high tier boundary (0.95 -> 95)", () => {
    expect(confidencePercent(0.95)).toBe(95);
  });

  it("agrees with just below the high tier boundary (0.949 -> 95)", () => {
    // 0.949 * 100 = 94.9, which rounds to 95 — the same tens digit as the 0.95
    // boundary, so the displayed percentage never contradicts the tier switch.
    expect(confidencePercent(0.949)).toBe(95);
  });

  it("agrees with the medium tier boundary (0.80 -> 80)", () => {
    expect(confidencePercent(0.8)).toBe(80);
  });

  it("agrees with just below the medium tier boundary (0.799 -> 80)", () => {
    expect(confidencePercent(0.799)).toBe(80);
  });
});

describe("confidenceTone / CONFIDENCE_TONES", () => {
  it("gives low the warning left-edge treatment", () => {
    expect(confidenceTone("low").card).toBe("border-l-2 border-l-warn");
  });

  it("gives not-found the same left-edge treatment as low", () => {
    expect(confidenceTone("not-found").card).toBe("border-l-2 border-l-warn");
  });

  it("gives medium a dimmed fill of the primary hue", () => {
    expect(confidenceTone("medium").bar).toBe("bg-primary/45");
  });

  it("gives high the full-strength primary fill", () => {
    expect(confidenceTone("high").bar).toBe("bg-primary");
  });

  it("CONFIDENCE_TONES has an entry for every tier confidenceTone can be asked for", () => {
    expect(Object.keys(CONFIDENCE_TONES).sort()).toEqual(
      ["high", "low", "medium", "not-found"].sort()
    );
  });
});

describe("isLineItemField / groupReviewFields", () => {
  it("recognises a line-item id", () => {
    expect(isLineItemField({ id: "line_items.0" })).toBe(true);
  });

  it("recognises a scalar id", () => {
    expect(isLineItemField({ id: "invoice_id" })).toBe(false);
  });

  it("splits scalars and line items, preserving order within each group", () => {
    const fields = [
      field("invoice_id"),
      field("line_items.0"),
      field("date"),
      field("line_items.1"),
      field("vendor_name"),
      field("line_items.2"),
    ];

    const { scalars, lineItems } = groupReviewFields(fields);

    expect(scalars.map((f) => f.id)).toEqual(["invoice_id", "date", "vendor_name"]);
    expect(lineItems.map((f) => f.id)).toEqual([
      "line_items.0",
      "line_items.1",
      "line_items.2",
    ]);
  });
});

describe("reviewedSummary", () => {
  it("formats the standard case", () => {
    expect(reviewedSummary(3, 6)).toBe("3 of 6 fields reviewed");
  });

  it("does not pluralise for a singular total", () => {
    expect(reviewedSummary(1, 1)).toBe("1 of 1 fields reviewed");
  });

  it("does not special-case zero", () => {
    expect(reviewedSummary(0, 0)).toBe("0 of 0 fields reviewed");
  });
});

describe("reviewedPercent", () => {
  it("returns 0 for an empty field list rather than NaN", () => {
    expect(reviewedPercent(0, 0)).toBe(0);
  });

  it("computes a partial percentage", () => {
    expect(reviewedPercent(1, 4)).toBe(25);
  });

  it("returns 100 when every field is approved", () => {
    expect(reviewedPercent(4, 4)).toBe(100);
  });
});

describe("field-display.ts stays free of its own confidence thresholds", () => {
  it("never redeclares the 0.95 / 0.8 tier boundaries; tiers come only from tierFor", () => {
    // A duplicated threshold here is exactly how the bar and the card
    // treatment could drift apart from `lib/extraction/confidence.ts`.
    const absolutePath = fileURLToPath(new URL("./field-display.ts", import.meta.url));
    const source = readFileSync(absolutePath, "utf8");

    expect(source).not.toMatch(/0\.95\b/);
    expect(source).not.toMatch(/0\.8\b/);
    expect(source).toMatch(/\btierFor\b|ConfidenceTier/);
  });
});
