# Status: 010-landing-and-upload

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] Hero + how-it-works section
- [x] `UploadDropzone` with drag-drop and file picker
- [x] Validation + inline errors
- [x] Wiring to `startExtraction`
- [x] No unit tests for the presentational surfaces — Notes exception; `rejectUpload`/`HELPER_TEXT`/`MAX_FILE_MB` unit-tested instead
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- No unit tests for the presentational surfaces (landing layout, hero, how-it-works, dropzone DOM/drag behaviour): browser-verified instead, per the exception below. The real validation gate lives in 008 and is unit-tested there; duplicating it here would test the affordance, not the rule — except for the one pure helper (`rejectUpload`) extracted specifically so it *could* be unit-tested without a DOM; see the Unit tests note near the end of this list.
- The `Try Demo Invoice` button belongs here visually but stays inert until 015 provides the asset.
- Decision: the client-side check imports `MAX_FILE_BYTES` and `resolveMediaType` from `lib/extraction/providers/local` rather than restating them. This is the one exception to "no extraction imports" in the architecture note, and it is constants plus one pure function — no provider is constructed and no extraction runs here. A drifted copy of the thresholds would refuse files the engine accepts (or promise ones it refuses), which is worse than the coupling. `MAX_FILE_MB` and the `PDF, PNG or JPG · Max 10MB` helper text are derived from that constant, so the copy cannot drift either.
- Decision: the zone is a `<label htmlFor>`, not a `role="button"` div — the whole card opens the picker with no script, and the label text is the file input's accessible name. The visible `Choose File` button is `aria-hidden` with `tabIndex={-1}`: it is a pointer affordance for the same input, and exposing both would put two identical controls one keystroke apart. The input is `sr-only` (so still focusable), and its focus ring is drawn on the card via `has-[input:focus-visible]:ring-3`.
- Verified in a browser 2026-09-01 (agent-browser, Chrome, dev server on :3471), landing at 1280x633 and 390x844:
  - `notes.txt` -> inline `role="alert"`: "notes.txt isn't a supported file type. Choose a PDF, PNG or JPG."; an 11 MB PNG -> "huge-scan.png is 11.0MB. The limit is 10MB." Both via the file picker AND via a real `drop` event. No dialog, no navigation (URL stayed `/`), and the input is cleared so the same file can be re-picked.
  - Valid `sample-invoice.pdf` -> no alert, no navigation, and one `URL.createObjectURL` call, i.e. `startExtraction` ran.
  - Drag-over -> dashed border computes to `rgb(242, 106, 18)` (`--primary`) and the headline switches to "Drop to start extracting".
  - Tab order: logo, `How it works`, `Upload Document`, file input. Tabbing to the input draws a 3px `--ring` ring around the card; the decorative button is correctly skipped.
  - `How it works` in the header sets `#how-it-works` and scrolls the section into view.
- Incidentally closes ticket 009's carried-forward item: replacing a loaded document called `URL.revokeObjectURL` exactly once (observed with a spy), so the object-URL lifecycle is no longer unverified for the replace path. Unmount is still unobserved.
- Finding for the design system (002), not fixed here because it is a token-level decision and this ticket must not hardcode colours: axe reports 4 colour-contrast failures on this page, all from existing token pairs — white on `--primary` (3.06:1, every primary button including the header's) and `--muted-foreground` on `--canvas` (4.12:1, every muted paragraph on a cream surface). Both are just under the 4.5:1 AA threshold.
- Finding for `SiteHeader` (002), not fixed here because it is another ticket's file: at 390px the header nav overflows by 12px (`scrollWidth` 402 vs `clientWidth` 390), so the landing page scrolls sideways on a phone. The page's own content fits.
- Unit tests: the presentational surfaces (landing layout, hero, how-it-works, the dropzone's DOM/drag behaviour) keep the Notes exception above — browser-verified, not unit-tested. The one pure, DOM-free helper extracted from this ticket, `rejectUpload` (plus the derived `HELPER_TEXT`/`MAX_FILE_MB`) in `components/upload/validate-upload.ts`, is unit-tested in `components/upload/validate-upload.spec.ts`: accepted PDF/PNG/JPEG, the exact-limit vs. one-byte-over size boundary, an unsupported type, the empty-`file.type` extension fallback (and its absence), and the `HELPER_TEXT`/`MAX_FILE_MB` copy staying consistent with the enforced threshold. No production bugs found; all 9 new tests pass.

## Acceptance criteria
- [x] Landing renders header, hero, dropzone and how-it-works, matching the reference's cream marketing surface (verified in a browser 2026-09-01 — see Notes)
- [x] `How it works` in the header scrolls to the section (`#how-it-works`, `scroll-mt-20` under the sticky header)
- [x] Drag-and-drop and `Choose File` both accept a file; the drag-over state is visible (border and icon tile go `--primary`)
- [x] A `.txt` file and an oversize file are both rejected with an inline message and no navigation (both observed in a browser — see Notes)
- [x] A valid file calls `startExtraction` — verified in a browser. The processing state it moves to is ticket 011's; nothing renders for it yet.
- [x] No unit tests for the presentational surfaces — Notes exception recorded (presentational; validation covered in 008); `rejectUpload`/`HELPER_TEXT`/`MAX_FILE_MB` unit-tested here

## Handoff

- **Files touched:** `app/page.tsx`, `components/upload/UploadDropzone.tsx`, `components/upload/validate-upload.ts`, `components/upload/validate-upload.spec.ts` (new).
- **Tests:** `npx vitest run components/upload/validate-upload.spec.ts --no-coverage` → 1 file, 9 tests passed. Full suite `npx vitest run --no-coverage` → 16 files, 267 tests passed (258 pre-existing + 9 new). `npm run typecheck` → clean.
- **No production bugs found.** `rejectUpload` behaves as documented: type is checked before size, the size boundary is `> MAX_FILE_BYTES` (i.e. exactly-at-limit is accepted), and it falls back to the filename extension only when `file.type` is empty.
- **Follow-ups (carried forward, not fixed here):** 002's token-level colour-contrast failures (white on `--primary`, `--muted-foreground` on `--canvas`); `SiteHeader`'s 390px horizontal overflow. See Notes above.
- **Env vars:** none.
