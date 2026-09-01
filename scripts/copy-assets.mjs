#!/usr/bin/env node
/**
 * Vendors the pdf.js and tesseract.js runtime assets into `public/` so the app
 * runs with zero network access. Sourced straight from `node_modules` on every
 * `dev` / `build`, so the copies can never drift from the installed packages.
 *
 * Run via `npm run copy:assets` (also wired to `predev` / `prebuild`).
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const tesseractDir = join(publicDir, "tesseract");

/** Resolve a file inside an installed package without assuming node_modules layout. */
function pkgFile(pkg, ...segments) {
  const pkgRoot = dirname(require.resolve(`${pkg}/package.json`));
  return join(pkgRoot, ...segments);
}

const assets = [
  // pdf.js worker — loaded by PdfCanvas via GlobalWorkerOptions.workerSrc.
  {
    from: pkgFile("pdfjs-dist", "build", "pdf.worker.min.mjs"),
    to: join(publicDir, "pdf.worker.min.mjs"),
  },
  // tesseract.js web worker.
  {
    from: pkgFile("tesseract.js", "dist", "worker.min.js"),
    to: join(tesseractDir, "worker.min.js"),
  },
  // tesseract WASM core (SIMD build) plus the emscripten glue that loads it.
  {
    from: pkgFile("tesseract.js-core", "tesseract-core-simd.wasm"),
    to: join(tesseractDir, "tesseract-core-simd.wasm"),
  },
  {
    from: pkgFile("tesseract.js-core", "tesseract-core-simd.wasm.js"),
    to: join(tesseractDir, "tesseract-core-simd.wasm.js"),
  },
  // English language model — tesseract.js would otherwise fetch this from a CDN.
  {
    from: pkgFile("@tesseract.js-data/eng", "4.0.0", "eng.traineddata.gz"),
    to: join(tesseractDir, "eng.traineddata.gz"),
  },
];

await mkdir(tesseractDir, { recursive: true });

for (const { from, to } of assets) {
  await copyFile(from, to);
  console.log(`copied ${to.slice(root.length + 1)}`);
}
