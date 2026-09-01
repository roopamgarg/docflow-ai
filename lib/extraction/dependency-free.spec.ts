import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Regression guard for the ticket's core promise: the contracts layer is
 * pure — no pdf.js, no tesseract, no React. This scans the actual import/
 * require specifiers (not doc-comment prose, which freely mentions pdf.js
 * and tesseract.js by name) in every source file this ticket touches.
 */
const TICKET_SOURCE_FILES = [
  "./types.ts",
  "./provider.ts",
  "./errors.ts",
  "./confidence.ts",
  "./providers/registry.ts",
];

const FORBIDDEN_SPECIFIER = /pdfjs|tesseract|^react(-dom)?(\/.*)?$/i;

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const fromRe = /from\s+["']([^"']+)["']/g;
  const requireRe = /require\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(fromRe)) specifiers.push(match[1]);
  for (const match of source.matchAll(requireRe)) specifiers.push(match[1]);
  return specifiers;
}

describe("ticket 003 files stay dependency-free", () => {
  it.each(TICKET_SOURCE_FILES)(
    "%s imports nothing from pdfjs, tesseract or react",
    (relativePath) => {
      const absolutePath = fileURLToPath(new URL(relativePath, import.meta.url));
      const source = readFileSync(absolutePath, "utf8");
      const specifiers = importSpecifiers(source);

      for (const specifier of specifiers) {
        expect(specifier).not.toMatch(FORBIDDEN_SPECIFIER);
      }
    }
  );

  it("sanity-checks the scanner against a specifier it must catch", () => {
    expect(importSpecifiers('import x from "pdfjs-dist";')).toEqual([
      "pdfjs-dist",
    ]);
    expect("pdfjs-dist").toMatch(FORBIDDEN_SPECIFIER);
    expect("react").toMatch(FORBIDDEN_SPECIFIER);
    expect("react-dom").toMatch(FORBIDDEN_SPECIFIER);
    expect("./registry").not.toMatch(FORBIDDEN_SPECIFIER);
  });
});
