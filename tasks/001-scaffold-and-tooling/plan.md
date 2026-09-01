# 001 — Scaffold And Tooling

## Summary
Stand up the Next.js app with its styling and test tooling, vendor the pdf.js and tesseract runtime assets so the app can run offline, and replace the inherited architecture rules with ones that actually describe DocFlow.

## Dependencies
None (first ticket).

## Scope
- **Scaffold:** `create-next-app` — TypeScript, Tailwind v4, App Router, ESLint, no `src/` dir, `@/*` → `./*` alias.
- **Deps:** `lucide-react`, `pdfjs-dist`, `tesseract.js`; dev: `vitest`.
- **UI primitives:** `shadcn init` + `button card input badge progress separator label`. If the registry is unreachable, hand-write equivalents against `lib/utils.ts` (`cn` = `clsx` + `tailwind-merge`) — same API.
- **Bundler config:** `next.config.ts` sets `resolve.alias.canvas = false` and `encoding = false`; both tesseract.js and pdf.js reference the optional Node `canvas` package, which must not be bundled for the browser.
- **Offline assets:** `scripts/copy-assets.mjs` copies `pdfjs-dist/build/pdf.worker.min.mjs` → `public/`, and tesseract's `worker.min.js`, `tesseract-core-simd.wasm`, `eng.traineddata.gz` → `public/tesseract/`. Wired to `predev` / `prebuild` via a `copy:assets` script so they never drift from the installed packages.
- **Tests:** vitest config plus one smoke test proving the harness runs. No further unit tests — reason: this ticket is configuration only.
- **Docs:** rewrite `.claude/rules/architecture-layers.md` to describe DocFlow's layers (see Architecture notes), removing the `apps/api` / `apps/worker` / Prisma / mystery-interrogation-platform content that belongs to a different project.

## Architecture notes
This ticket establishes the boundaries every later ticket obeys. The rewritten rules should map:

| Concern | Location | Responsibility |
|---|---|---|
| View | `app/`, `components/` | UI only. No field rules, no confidence math. |
| State | `lib/document-context.tsx` | Client state: document, fields, status, edits, approvals, active field. |
| Service (domain) | `lib/extraction/providers/` | All extraction logic. Pure and deterministic wherever possible. |
| Contracts | `lib/extraction/types.ts`, `provider.ts`, `errors.ts` | Shared types, provider interface, error vocabulary. |
| Mapping | `lib/extraction/fields.ts`, `lib/export.ts` | Domain → display model, domain → export JSON. |

Hard rules to state: no `tesseract.js` import outside `lib/extraction/`; `pdfjs-dist` may be imported by a component only for *rendering* (`PdfCanvas`), never for extraction; no network calls anywhere (the offline guarantee); only `registry.ts` knows provider ids. Controller and Jobs layers are n/a — there is no server and no worker.

## Out of scope
- Design tokens and the app shell (002).
- Any extraction code (003+).
- Any page content or routes beyond what `create-next-app` generates.

## Acceptance criteria
- [ ] `npm run dev` serves the app; `npm run build` and `npx tsc --noEmit` are clean
- [ ] shadcn primitives exist and import from `components/ui`
- [ ] `npm run copy:assets` populates `public/pdf.worker.min.mjs` and `public/tesseract/*`; `predev` and `prebuild` invoke it
- [ ] `next.config.ts` aliases `canvas` and `encoding` to `false`
- [ ] `npx vitest run` executes and passes the smoke test
- [ ] `.claude/rules/architecture-layers.md` describes DocFlow's real layers with no remaining references to `apps/api`, `apps/worker`, Prisma, or the mystery-interrogation plan
- [ ] Unit tests cover the ticket's logic and pass (harness smoke test only — configuration-only ticket)

## Key files
- `package.json`
- `next.config.ts`
- `scripts/copy-assets.mjs`
- `vitest.config.ts`
- `.claude/rules/architecture-layers.md`
- `components/ui/`
