# Status: 001-scaffold-and-tooling

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] Next.js + Tailwind + shadcn scaffold
- [ ] Bundler config (`canvas` / `encoding` aliases)
- [ ] Offline asset copy script wired to predev/prebuild
- [ ] vitest harness
- [ ] `architecture-layers.md` rewritten for DocFlow
- [ ] Unit tests added and passing (harness smoke test — configuration-only ticket)
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- The inherited `architecture-layers.md` described a NestJS + BullMQ + Prisma monorepo for a different product. Rewriting it is in scope here because every later ticket is judged against it.

## Acceptance criteria
- [ ] `npm run dev` serves the app; `npm run build` and `npx tsc --noEmit` are clean
- [ ] shadcn primitives exist and import from `components/ui`
- [ ] `npm run copy:assets` populates `public/pdf.worker.min.mjs` and `public/tesseract/*`; `predev` and `prebuild` invoke it
- [ ] `next.config.ts` aliases `canvas` and `encoding` to `false`
- [ ] `npx vitest run` executes and passes the smoke test
- [ ] `.claude/rules/architecture-layers.md` describes DocFlow's real layers with no remaining references to `apps/api`, `apps/worker`, Prisma, or the mystery-interrogation plan
- [ ] Unit tests cover the ticket's logic and pass (harness smoke test only — configuration-only ticket)

## Handoff

(Leave empty until the ticket is done.)
