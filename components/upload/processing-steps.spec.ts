import { describe, it, expect } from "vitest";

import {
  processingStepStates,
  processingPercent,
  processingErrorMessage,
} from "./processing-steps";
import { ExtractionError } from "@/lib/extraction/errors";

describe("processingStepStates", () => {
  it("marks upload done and reading active while decoding", () => {
    expect(
      processingStepStates({
        phase: "working",
        step: { phase: "reading", ratio: 0 },
      })
    ).toEqual(["done", "active", "pending", "pending"]);
  });

  it("marks upload and structure detection done, extraction active during OCR", () => {
    expect(
      processingStepStates({
        phase: "working",
        step: { phase: "ocr", ratio: 0.5 },
      })
    ).toEqual(["done", "done", "active", "pending"]);
  });

  it("marks the first three steps done, review prep active while matching", () => {
    expect(
      processingStepStates({
        phase: "working",
        step: { phase: "matching", ratio: 0.9 },
      })
    ).toEqual(["done", "done", "done", "active"]);
  });

  it("marks every step done once ready", () => {
    expect(processingStepStates({ phase: "ready" })).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
  });

  it("claims only the upload on error, with no active step", () => {
    expect(
      processingStepStates({
        phase: "error",
        code: "no_text_found",
        message: "",
      })
    ).toEqual(["done", "pending", "pending", "pending"]);
  });

  it("marks every step pending while idle", () => {
    expect(processingStepStates({ phase: "idle" })).toEqual([
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });
});

describe("processingPercent", () => {
  it("scales a working ratio to a whole percentage", () => {
    expect(
      processingPercent({
        phase: "working",
        step: { phase: "ocr", ratio: 0.18 },
      })
    ).toBe(18);
  });

  it("rounds to the nearest whole percentage", () => {
    expect(
      processingPercent({
        phase: "working",
        step: { phase: "ocr", ratio: 0.905 },
      })
    ).toBe(91);
  });

  it("is 100 once ready", () => {
    expect(processingPercent({ phase: "ready" })).toBe(100);
  });

  it("is 0 while idle", () => {
    expect(processingPercent({ phase: "idle" })).toBe(0);
  });

  it("is 0 on error", () => {
    expect(
      processingPercent({
        phase: "error",
        code: "internal",
        message: "boom",
      })
    ).toBe(0);
  });

  it("treats a non-finite ratio as 0", () => {
    expect(
      processingPercent({
        phase: "working",
        step: { phase: "ocr", ratio: NaN },
      })
    ).toBe(0);
  });

  it("clamps a ratio below 0 up to 0", () => {
    expect(
      processingPercent({
        phase: "working",
        step: { phase: "reading", ratio: -0.4 },
      })
    ).toBe(0);
  });

  it("clamps a ratio above 1 down to 100", () => {
    expect(
      processingPercent({
        phase: "working",
        step: { phase: "matching", ratio: 1.7 },
      })
    ).toBe(100);
  });
});

describe("processingErrorMessage", () => {
  it("gives no_text_found its specific copy regardless of the thrown message", () => {
    expect(processingErrorMessage("no_text_found", "anything at all")).toBe(
      "We couldn't find any readable text. Try a clearer scan."
    );
    expect(processingErrorMessage("no_text_found", "")).toBe(
      "We couldn't find any readable text. Try a clearer scan."
    );
  });

  it("passes other codes' thrown messages through unchanged", () => {
    expect(processingErrorMessage("internal", "custom failure text")).toBe(
      "custom failure text"
    );
  });

  it("falls back to the code's default message when the thrown message is blank", () => {
    expect(processingErrorMessage("unreadable", "")).toBe(
      new ExtractionError("unreadable").message
    );
    expect(processingErrorMessage("too_large", "   ")).toBe(
      new ExtractionError("too_large").message
    );
  });
});

