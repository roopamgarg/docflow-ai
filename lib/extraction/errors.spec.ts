import { describe, it, expect } from "vitest";
import {
  ExtractionError,
  isExtractionError,
  EXTRACTION_ERROR_CODES,
} from "./errors";

describe("ExtractionError", () => {
  it("is an instanceof Error", () => {
    expect(new ExtractionError("internal")).toBeInstanceOf(Error);
  });

  it("sets name to ExtractionError", () => {
    expect(new ExtractionError("internal").name).toBe("ExtractionError");
  });

  it("sets code to the constructor argument", () => {
    expect(new ExtractionError("too_large").code).toBe("too_large");
  });

  it.each(EXTRACTION_ERROR_CODES)(
    "uses the default message for code %s when none is supplied",
    (code) => {
      const error = new ExtractionError(code);
      expect(error.message).toBeTruthy();
      expect(typeof error.message).toBe("string");
    }
  );

  it("uses each code's specific default message", () => {
    expect(new ExtractionError("unsupported_media").message).toBe(
      "That file type isn't supported. Use a PDF, PNG or JPEG."
    );
    expect(new ExtractionError("too_large").message).toBe(
      "That file is too large to process."
    );
    expect(new ExtractionError("unreadable").message).toBe(
      "We couldn't read that file. It may be damaged."
    );
    expect(new ExtractionError("no_text_found").message).toBe(
      "We couldn't find any readable text in that document."
    );
    expect(new ExtractionError("internal").message).toBe(
      "Something went wrong while processing that document."
    );
  });

  it("uses a supplied message instead of the default", () => {
    expect(new ExtractionError("internal", "custom message").message).toBe(
      "custom message"
    );
  });

  it("carries an optional cause", () => {
    const cause = new Error("underlying");
    const error = new ExtractionError("internal", undefined, { cause });
    expect(error.cause).toBe(cause);
  });
});

describe("isExtractionError", () => {
  it("narrows an ExtractionError to true", () => {
    expect(isExtractionError(new ExtractionError("internal"))).toBe(true);
  });

  it("returns false for a plain Error", () => {
    expect(isExtractionError(new Error("plain"))).toBe(false);
  });

  it("returns false for a non-Error value", () => {
    expect(isExtractionError("not an error")).toBe(false);
    expect(isExtractionError(null)).toBe(false);
    expect(isExtractionError(undefined)).toBe(false);
    expect(isExtractionError({ code: "internal" })).toBe(false);
  });
});
