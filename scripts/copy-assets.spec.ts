import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard: the implementer found that the plan's assumed asset
// paths (e.g. eng.traineddata.gz shipping in tesseract.js) didn't match what
// actually installs into node_modules. This runs the real copy-assets script
// end to end so a future dependency bump that moves/renames a vendored file
// fails here instead of silently breaking the offline runtime at `next dev`.
describe("copy-assets script", () => {
  it("resolves every `from` path in node_modules and copies all assets", async () => {
    await expect(import("./copy-assets.mjs")).resolves.not.toThrow();

    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const publicDir = join(root, "public");
    const tesseractDir = join(publicDir, "tesseract");

    const expected = [
      join(publicDir, "pdf.worker.min.mjs"),
      join(tesseractDir, "worker.min.js"),
      join(tesseractDir, "tesseract-core-simd.wasm"),
      join(tesseractDir, "tesseract-core-simd.wasm.js"),
      join(tesseractDir, "eng.traineddata.gz"),
    ];

    for (const file of expected) {
      expect(existsSync(file)).toBe(true);
    }
  });
});
