#!/usr/bin/env node
/**
 * Regenerates the two captured tesseract.js payloads behind `ocr.spec.ts`:
 *
 * | fixture                              | engine                | why it exists |
 * |--------------------------------------|-----------------------|---------------|
 * | `tesseract-invoice-lstm.json`         | OEM 1 (`LSTM_ONLY`)   | What `ocr.ts` actually runs. Every `word.choices` holds exactly one entry — the chosen reading — so the mapping must produce no `alternatives`. |
 * | `tesseract-invoice-legacy-choices.json` | OEM 0 (`TESSERACT_ONLY`) | The legacy engine is the only way to get real multi-choice words, so this is the only realistic input for the `alternatives` mapping. |
 *
 * Both are real `worker.recognize(..., { blocks: true })` output for the same
 * committed `scanned-invoice.png` (900x360, deliberately blurred so the OCR is
 * imperfect and the confidences vary). Only `word.symbols` is stripped: nothing
 * reads it and it triples the file size. Every other field, including
 * `blocktype: 1` and `is_ltr: 1` arriving as numbers rather than the
 * string/boolean the tesseract.js typings promise, is verbatim.
 *
 * `scanned-invoice.png` itself was rendered with `sharp` (a transitive dep, not
 * a declared one, which is why the PNG is committed rather than regenerated
 * here) from this SVG:
 *
 *     <svg width="900" height="360"><rect width="900" height="360" fill="#fff"/>
 *       <text x="40" y="70"  font-size="34">Northwind Supply Co.</text>
 *       <text x="40" y="140" font-size="28">Invoice #: INV-2026-0142</text>
 *       <text x="40" y="196" font-size="28">Date: 2026-03-14</text>
 *       <text x="40" y="270" font-size="30">Total Due: $1,284.50</text>
 *     </svg>
 *
 *   sharp(svg).blur(1.4).grayscale().png({ compressionLevel: 9, palette: true })
 *
 * Requires the vendored language data, so run `npm run copy:assets` first.
 * Recognition results shift slightly between tesseract versions, so re-run this
 * (and re-read the numbers the spec asserts) whenever tesseract.js is upgraded.
 *
 * Run: node lib/extraction/providers/local/__fixtures__/capture-tesseract-result.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createWorker } from "tesseract.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..", "..", "..", "..");

/** `[oem, fixture file]`. OEM 1 is LSTM only; OEM 0 is the legacy engine. */
const CAPTURES = [
  [1, "tesseract-invoice-lstm.json"],
  [0, "tesseract-invoice-legacy-choices.json"],
];

/** Drop `word.symbols`; keep every other field exactly as tesseract sent it. */
function stripSymbols(data) {
  return {
    ...data,
    blocks: (data.blocks ?? []).map((block) => ({
      ...block,
      paragraphs: block.paragraphs.map((paragraph) => ({
        ...paragraph,
        lines: paragraph.lines.map((line) => ({
          ...line,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          words: line.words.map(({ symbols, ...word }) => word),
        })),
      })),
    })),
  };
}

const image = await readFile(join(here, "scanned-invoice.png"));

for (const [oem, fileName] of CAPTURES) {
  const worker = await createWorker("eng", oem, {
    // Local paths only — this script must not reach the network either.
    langPath: join(root, "public", "tesseract"),
    // Without this, Node writes `eng.traineddata` into the cwd.
    cacheMethod: "none",
    logger: () => {},
  });

  try {
    const { data } = await worker.recognize(image, {}, { blocks: true });
    const target = join(here, fileName);
    await writeFile(target, `${JSON.stringify(stripSymbols(data), null, 2)}\n`);
    console.log(`captured ${fileName} (oem ${oem}, confidence ${data.confidence})`);
  } finally {
    await worker.terminate();
  }
}
