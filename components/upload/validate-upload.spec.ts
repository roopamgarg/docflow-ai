import { describe, it, expect } from "vitest";

import { HELPER_TEXT, MAX_FILE_MB, rejectUpload } from "./validate-upload";

/** A `File` with just the fields `rejectUpload` reads: name, type, size. */
function file(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

const MAX_FILE_BYTES = MAX_FILE_MB * 1024 ** 2;

describe("rejectUpload", () => {
  it("accepts a PDF, a PNG and a JPEG", () => {
    expect(
      rejectUpload(file("invoice.pdf", "application/pdf", 1024))
    ).toBeNull();
    expect(rejectUpload(file("scan.png", "image/png", 1024))).toBeNull();
    expect(rejectUpload(file("photo.jpg", "image/jpeg", 1024))).toBeNull();
  });

  it("accepts a file exactly at the size limit", () => {
    expect(
      rejectUpload(file("at-limit.pdf", "application/pdf", MAX_FILE_BYTES))
    ).toBeNull();
  });

  it("rejects a file one byte over the size limit, with the size reason", () => {
    const oversize = file(
      "over-limit.pdf",
      "application/pdf",
      MAX_FILE_BYTES + 1
    );
    const megabytes = (oversize.size / 1024 ** 2).toFixed(1);

    expect(rejectUpload(oversize)).toBe(
      `over-limit.pdf is ${megabytes}MB. The limit is ${MAX_FILE_MB}MB.`
    );
  });

  it("rejects a clearly oversize file with a human-readable size", () => {
    const huge = file("huge-scan.png", "image/png", 11 * 1024 ** 2);

    expect(rejectUpload(huge)).toBe(
      "huge-scan.png is 11.0MB. The limit is 10MB."
    );
  });

  it("rejects an unsupported type before checking size", () => {
    expect(rejectUpload(file("notes.txt", "text/plain", 10))).toBe(
      "notes.txt isn't a supported file type. Choose a PDF, PNG or JPG."
    );
  });

  it("falls back to the filename extension when the browser reports no type", () => {
    expect(rejectUpload(file("scan.pdf", "", 1024))).toBeNull();
  });

  it("rejects when type is empty and the extension is not recognised either", () => {
    expect(rejectUpload(file("mystery", "", 1024))).toBe(
      "mystery isn't a supported file type. Choose a PDF, PNG or JPG."
    );
  });
});

describe("HELPER_TEXT and MAX_FILE_MB", () => {
  it("HELPER_TEXT matches the plan's required copy", () => {
    expect(HELPER_TEXT).toBe("PDF, PNG or JPG · Max 10MB");
  });

  it("MAX_FILE_MB matches the byte threshold rejectUpload actually enforces", () => {
    expect(MAX_FILE_MB).toBe(10);
    expect(
      rejectUpload(file("edge.pdf", "application/pdf", MAX_FILE_BYTES))
    ).toBeNull();
    expect(
      rejectUpload(file("edge.pdf", "application/pdf", MAX_FILE_BYTES + 1))
    ).not.toBeNull();
  });
});
