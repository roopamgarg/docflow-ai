import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard for ticket 015: `Try Demo Invoice` (see
// components/upload/UploadDropzone.tsx) fetches public/demo-invoice.png at
// runtime with no build-time reference to it, so a missing or truncated file
// would silently break the primary demo flow with no failing test anywhere
// else. This does not (and must not) run OCR on the asset — it only checks
// that the file the button fetches actually exists and is a real PNG, not a
// zero-byte or corrupted placeholder.
describe("demo invoice asset", () => {
  it("exists and is a non-trivial PNG", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const assetPath = join(root, "public", "demo-invoice.png");

    const stats = statSync(assetPath);
    // The real asset is ~190KB (1588x2246 @2x capture); anything near-empty
    // indicates a truncated or placeholder file rather than a real capture.
    expect(stats.size).toBeGreaterThan(20_000);

    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const header = readFileSync(assetPath).subarray(0, 8);
    expect(header.equals(pngSignature)).toBe(true);
  });
});
