#!/usr/bin/env node
/**
 * Regenerates `sample-invoice.pdf`, the fixture behind `pdf-text.spec.ts`.
 *
 * Hand-built rather than downloaded so every number a test asserts is visible
 * here: the file is uncompressed, uses the built-in Helvetica (no embedded font
 * program), and positions each text run with an explicit `Tm` matrix. A run
 * written as `1 0 0 1 <x> <y> Tm` at `<size> Tf` therefore arrives in
 * `getTextContent()` as `transform === [size, 0, 0, size, x, y]` in PDF user
 * space, whose origin is the BOTTOM-LEFT of the 612x792 MediaBox.
 *
 * Page 3 deliberately has no text at all: it stands in for a scanned,
 * image-only page, so the per-page character count has something to report 0 for.
 *
 * Run: node lib/extraction/providers/local/__fixtures__/make-sample-pdf.mjs
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

/** `[fontSize, x, y, text]` per run — y is measured UP from the page bottom. */
const PAGES = [
  [
    [12, 72, 700, "Invoice INV-1024"],
    [12, 72, 680, "Vendor Northwind Traders"],
    [24, 72, 640, "Total 1234.56"],
  ],
  [[12, 100, 500, "Page two continued"]],
  [],
];

function contentStream(runs) {
  return runs
    .map(
      ([size, x, y, text]) =>
        `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${text.replace(
          /([\\()])/g,
          "\\$1"
        )}) Tj ET`
    )
    .join("\n");
}

// Object numbering: 1 catalog, 2 page tree, 3 font, then per page a page
// object followed by its content stream.
const objects = [];
const pageObjectNumbers = PAGES.map((_, index) => 4 + index * 2);

objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
objects[2] = `<< /Type /Pages /Count ${PAGES.length} /Kids [${pageObjectNumbers
  .map((n) => `${n} 0 R`)
  .join(" ")}] >>`;
objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

PAGES.forEach((runs, index) => {
  const pageNumber = pageObjectNumbers[index];
  const contentsNumber = pageNumber + 1;
  const stream = contentStream(runs);
  objects[pageNumber] =
    `<< /Type /Page /Parent 2 0 R ` +
    `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
    `/Resources << /Font << /F1 3 0 R >> >> ` +
    `/Contents ${contentsNumber} 0 R >>`;
  objects[
    contentsNumber
  ] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
});

// Serialise, tracking byte offsets for the cross-reference table.
let pdf = "%PDF-1.4\n";
const offsets = [];
for (let n = 1; n < objects.length; n += 1) {
  offsets[n] = Buffer.byteLength(pdf);
  pdf += `${n} 0 obj\n${objects[n]}\nendobj\n`;
}

const startxref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
for (let n = 1; n < objects.length; n += 1) {
  pdf += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

const target = join(
  dirname(fileURLToPath(import.meta.url)),
  "sample-invoice.pdf"
);
await writeFile(target, pdf, "latin1");
console.log(`wrote ${target} (${Buffer.byteLength(pdf)} bytes)`);
