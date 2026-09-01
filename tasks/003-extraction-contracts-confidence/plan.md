# 003 — Extraction Contracts And Confidence

## Summary
Define the vendor-neutral extraction contracts every later ticket codes against — the geometry-bearing word model, the provider interface, the error vocabulary — plus the confidence composition and tier logic that the whole UI keys off.

## Dependencies
- 001-scaffold-and-tooling

## Scope
- **Contracts (`types.ts`):** `Word` (`text`, `confidence` 0..1, `bbox {x0,y0,x1,y1}` in top-left page pixels, `page`, optional `alternatives`), `Page` (`index`, `width`, `height`, `words`), `DocumentText` (`pages`, `source: 'pdf-text' | 'ocr'`), `Extraction`, and `ExtractedField` (adds `label`, `originalValue`, `reason`, `bbox`, `page`, `approved`, `edited`).
- **Provider interface (`provider.ts`):** `ExtractionProvider { id, label, extract(file, onProgress) }` and `ExtractionProgress { phase: 'reading' | 'ocr' | 'matching'; ratio }`. Progress is in the interface because the local engine has a genuine signal — the UI must never fake one.
- **Errors (`errors.ts`):** `ExtractionError` carrying codes `unsupported_media | too_large | unreadable | no_text_found | internal`, so the UI renders failures identically whatever the engine.
- **Registry (`registry.ts`):** `getExtractionProvider(id = 'local')` over a `Record<string, ProviderFactory>`. The only module that knows provider ids.
- **Confidence (`confidence.ts`):** `composeConfidence(words, matchStrength)` = `mean(word confidence) * matchStrength`; `MatchStrength` constants (1.00 label+adjacent+pattern, 0.85 label-or-pattern-only, 0.60 positional heuristic, 0.00 not found); `tierFor(confidence)` returning `high | medium | low | not-found` at the 0.95 / 0.80 / 0 boundaries.
- **Tests:** `confidence.spec.ts` — composition arithmetic, each tier boundary exactly (0.95, 0.949, 0.80, 0.799, 0), and that a `pdf-text` word set (confidence 1.0) reduces confidence to match strength alone.

## Architecture notes
Contracts layer. Pure types and pure functions — no pdfjs, no tesseract, no React, no I/O. Tier logic lives here in exactly one place so the confidence bar and the card styling can never disagree.

## Out of scope
- Any actual extraction (004, 005, 006, 007).
- `fields.ts` mapping and the local provider itself (008).
- Rendering the tiers (014).

## Acceptance criteria
- [ ] `Word`, `Page`, `DocumentText`, `Extraction`, `ExtractedField`, `ExtractionProvider`, `ExtractionProgress` and `ExtractionError` are exported and used by nothing outside `lib/extraction`
- [ ] `getExtractionProvider()` resolves a registered id and throws `ExtractionError('internal')` for an unknown one
- [ ] `tierFor` returns the documented tier at every boundary value
- [ ] `composeConfidence` returns match strength unchanged when all word confidences are 1.0
- [ ] Unit tests cover confidence composition and every tier boundary, and pass
- [ ] No pdfjs, tesseract, or React import appears in this ticket's files

## Key files
- `lib/extraction/types.ts`
- `lib/extraction/provider.ts`
- `lib/extraction/errors.ts`
- `lib/extraction/providers/registry.ts`
- `lib/extraction/confidence.ts`
- `lib/extraction/confidence.spec.ts`
