# Status: 001-scaffold-and-tooling

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] Next.js + Tailwind + shadcn scaffold
- [x] Bundler config (`canvas` / `encoding` aliases)
- [x] Offline asset copy script wired to predev/prebuild
- [x] vitest harness
- [x] `architecture-layers.md` rewritten for DocFlow
- [x] Unit tests added and passing (harness smoke test — configuration-only ticket)
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- The inherited `architecture-layers.md` described a NestJS + BullMQ + Prisma monorepo for a different product. Rewriting it is in scope here because every later ticket is judged against it.

- Scaffolded via `create-next-app` into a temp dir, then rsynced in (the repo dir was non-empty: `.claude/`, `tasks/`, `.git/`, `.gitignore`). Existing files preserved; `.gitignore` merged (create-next-app's set + the repo's vendored-asset ignores).
- shadcn registry was reachable: `shadcn init -b radix -p nova` + `shadcn add button card input badge progress separator label`. No hand-written primitives needed. The CLI also wrote `lib/utils.ts` (`cn` = clsx + tailwind-merge), `components.json`, theme vars in `app/globals.css`, and Geist fonts in `app/layout.tsx`.
- Versions installed: next 16.3.4, pdfjs-dist 6.3.289, tesseract.js 7.0.0, tesseract.js-core 7.0.0, vitest 4.1.11.
- Asset sources verified in `node_modules` (not assumed): `pdfjs-dist/build/pdf.worker.min.mjs`, `tesseract.js/dist/worker.min.js`, `tesseract.js-core/tesseract-core-simd.wasm` (+ the `.wasm.js` emscripten glue, which is required to load the wasm). `eng.traineddata.gz` ships in **no** installed package — tesseract.js fetches it from a CDN at runtime, which breaks the offline guarantee, so `@tesseract.js-data/eng` was added as a devDependency and the script copies `4.0.0/eng.traineddata.gz` from it. `tesseract.js-core` was also added as an explicit devDependency so `copy-assets.mjs` does not rely on npm hoisting.
- Next 16 defaults to Turbopack, which errors on a bare `webpack` config. `next.config.ts` therefore carries both the required `webpack` `canvas`/`encoding` → `false` aliases and an empty `turbopack: {}` (the documented acknowledgement); Turbopack resolves the optional requires itself.
- `agentRules: false` in `next.config.ts`: Next 16 auto-writes `AGENTS.md` + `CLAUDE.md` on `next dev`. Both were generated once and deleted — this repo keeps agent rules in `.claude/rules/`.
- `eslint.config.mjs` ignores `public/**`: the vendored minified pdf.js/tesseract bundles produced 2000+ bogus lint findings.
- `typecheck` script is `next typegen && tsc --noEmit` — `app/layout.tsx` uses the Next-generated `LayoutProps` global, so a bare `tsc --noEmit` fails on a clean checkout until route types exist.
- `vitest.config.ts` harness verified end-to-end with a throwaway test (alias `@/*` resolves, transform works), which was then deleted: test files are owned by the test agent, so no `*.test.ts` is committed here yet. `npx vitest run` currently exits 1 with "No test files found".
- Side effect to flag: while probing the dev server, port 3000 was already held by an unrelated `next dev` process (pid 76708) and a `pkill -f "next dev"` terminated it. Re-verification used an explicit port 3457.
- Test agent (2026-09-01): added `lib/utils.spec.ts` (the `cn` harness smoke test) and, as the optional regression guard the plan calls out, `scripts/copy-assets.spec.ts`, which runs the real `copy-assets.mjs` end to end and asserts every vendored asset lands in `public/`. Both are real logic in `lib/` / `scripts/` (ours), not framework/shadcn boilerplate, so no no-tests exception is needed. `npx vitest run` (previously exiting 1 with "No test files found") now passes. No production bugs found.

## Acceptance criteria
- [x] `npm run dev` serves the app; `npm run build` and `npx tsc --noEmit` are clean
- [x] shadcn primitives exist and import from `components/ui`
- [x] `npm run copy:assets` populates `public/pdf.worker.min.mjs` and `public/tesseract/*`; `predev` and `prebuild` invoke it
- [x] `next.config.ts` aliases `canvas` and `encoding` to `false`
- [x] `npx vitest run` executes and passes the smoke test
- [x] `.claude/rules/architecture-layers.md` describes DocFlow's real layers with no remaining references to `apps/api`, `apps/worker`, Prisma, or the mystery-interrogation plan
- [x] Unit tests cover the ticket's logic and pass (harness smoke test only — configuration-only ticket)

## Handoff

- Files touched: `lib/utils.spec.ts` (new), `scripts/copy-assets.spec.ts` (new).
- Test command: `npx vitest run lib/utils.spec.ts scripts/copy-assets.spec.ts --no-coverage`
- Result: 2 test files passed, 5 tests passed, exit code 0.
- No env vars added. No production code changed. No follow-ups.
