# DocFlow AI — Task Board

Ticket process: `.claude/rules/task-driven-workflow.md`.
Layering conventions: `.claude/rules/architecture-layers.md` (rewritten for this project in ticket 001).
Source plan: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`.

## What we're building

An MVP for AI-assisted document extraction with human review: upload an invoice, extract its
fields with per-field confidence, verify and correct them inline, approve, export JSON.

**Extraction runs entirely in the browser** — pdf.js reads a digital PDF's text layer, tesseract.js
OCRs images and scanned PDFs, and a rule engine identifies the fields. No LLM, no API key, no
server, no cost, works offline. Two consequences shape the whole product:

- **Confidence is measured, not claimed** — real per-word OCR confidence, composed with a match
  strength reflecting how each value was found.
- **Every field knows where it came from** — bounding boxes let a focused field highlight its exact
  region on the document.

## Tickets

| # | Folder | Summary | Depends on |
|---|--------|---------|------------|
| 001 | [001-scaffold-and-tooling](./001-scaffold-and-tooling/) | Next 15 + Tailwind v4 + shadcn, vendored pdf/tesseract assets, vitest; rewrite architecture rules for DocFlow | — |
| 002 | [002-design-system-and-shell](./002-design-system-and-shell/) | Design tokens from the reference image, `AppShell` floating card, `IconRail`, `SiteHeader` | 001 |
| 003 | [003-extraction-contracts-confidence](./003-extraction-contracts-confidence/) | Word/Page/Extraction contracts, provider interface, error vocabulary, confidence composition + tiers | 001 |
| 004 | [004-pdf-text-extraction-source](./004-pdf-text-extraction-source/) | PDF text layer → `Word[]`, bottom-left → top-left coordinate conversion | 003 |
| 005 | [005-ocr-extraction-source](./005-ocr-extraction-source/) | tesseract.js v6 → `Word[]` with confidence, bboxes, alternates, real progress | 003 |
| 006 | [006-line-grouping-and-field-rules](./006-line-grouping-and-field-rules/) | Line/column primitives + matchers for invoice_id, date, vendor_name, total_amount | 003 |
| 007 | [007-line-item-table-extraction](./007-line-item-table-extraction/) | Table header detection, column bounds, row pairing, totals-row stop | 006 |
| 008 | [008-local-provider-and-field-mapping](./008-local-provider-and-field-mapping/) | `createLocalProvider` route selection + scanned-PDF fallback, assembly, `toFields` | 004, 005, 006, 007 |
| 009 | [009-document-state-and-routing](./009-document-state-and-routing/) | `DocumentProvider` state, edit/approval semantics, three routes + guards | 003 |
| 010 | [010-landing-and-upload](./010-landing-and-upload/) | Landing page, hero, `UploadDropzone` with validation and inline errors | 002, 009 |
| 011 | [011-processing-state](./011-processing-state/) | Four real steps, true progress percentage, error + retry | 009, 010 |
| 012 | [012-document-viewer](./012-document-viewer/) | Viewer toolbar (zoom / fit / pages), `PdfCanvas` with render cancellation | 002, 009 |
| 013 | [013-field-highlight-overlay](./013-field-highlight-overlay/) | Zoom-aware bbox overlay, cross-page jump | 008, 012 |
| 014 | [014-extraction-review-panel](./014-extraction-review-panel/) | Field cards, inline editing, confidence bars, approval, review progress | 002, 008, 009 |
| 015 | [015-demo-invoice](./015-demo-invoice/) | `DemoInvoice` sheet + PNG asset, demo button through the real pipeline | 008, 010 |
| 016 | [016-approval-success-and-export](./016-approval-success-and-export/) | Success screen, `toExportJson`, `parseAmount`, download | 009, 014 |
| 017 | [017-keyboard-and-accessibility](./017-keyboard-and-accessibility/) | Focus rings, `e`/`a` shortcuts, focus-driven highlight, `aria-live` | 014 |

## Dependency graph

```
001 scaffold
 ├── 002 design system ──┬─────────────┬──────────────┐
 └── 003 contracts       │             │              │
      ├── 004 pdf-text ──┐             │              │
      ├── 005 ocr ───────┤             │              │
      ├── 006 rules ──┬──┤             │              │
      │               └── 007 items    │              │
      │                  │             │              │
      │        008 local provider ◄────┘              │
      │         (needs 004+005+006+007)               │
      │              │                                │
      └── 009 state ──┼──┬── 010 landing ── 011 processing
                      │  │        └──────── 015 demo ◄─ 008
                      │  └── 012 viewer ─── 013 highlight ◄─ 008
                      └───── 014 panel ◄─ 008
                                │
                                ├── 016 success + export
                                └── 017 keyboard + a11y
```

**Parallel work:** 004, 005 and 006 are independent of each other — 006 tests against fixture
`Word[]` rather than real extraction. 002/009 can proceed alongside the whole extraction track.

**Milestones:** 008 is the convergence point (first real fields from a real file). 015 is the first
end-to-end demoable state, once 011, 012 and 014 are done.

## Status legend

| State | Meaning |
|-------|---------|
| `pending` | Not started; eligible once dependencies are `done` |
| `in_progress` | Actively being worked; only one at a time unless the user overrides |
| `done` | Acceptance criteria met, tests passing, handoff recorded |
| `blocked` | Cannot proceed; blocker noted in `status.md` |

## Starting work

1. Pick the lowest-numbered `pending` ticket whose dependencies are all `done`.
2. Set its `status.md` state to `in_progress` and note the start date.
3. Work only within that ticket's scope; scope changes go in `plan.md` or a new ticket.
4. Check off acceptance criteria in `status.md` as they complete.
5. Confirm unit tests pass, or record a Notes exception where the ticket says none apply.
6. Set state to `done`, record the completion date, and fill in **Handoff**.

Currently eligible: **001-scaffold-and-tooling**.

## Testing policy

Per `.claude/rules/task-driven-workflow.md`, tickets carrying real logic have unit-test acceptance
criteria: **003, 004, 006, 007, 008, 009, 016**. The remaining tickets are scaffold, CSS, or
DOM/canvas-only and record an explicit Notes exception rather than skipping silently.
