---
description: Layered architecture conventions (API MVC-inspired + worker handlers)
alwaysApply: true
---

# Architecture Layers

This project is **not classic server-rendered MVC**. It uses a layered API + SPA + worker split. Preserve these boundaries in every ticket.

## Mapping

| Concern | Location | Responsibility |
|---------|----------|----------------|
| **View** | `apps/web` | UI only. Call API via HTTP. No Prisma, no Google/Meta SDKs, no business rules. |
| **Controller** | `apps/api` `*.controller.ts` | HTTP only: parse/validate input, auth/CSRF guards, call a service, return DTO. No Google/Meta calls, no job scheduling, no Prisma queries beyond what a thin service needs. |
| **Service** | `apps/api` `*.service.ts` | Business logic, orchestration, transactions. Controllers and workers call services. |
| **Model / data** | Prisma schema + repositories (optional) | Persistence. Prefer services using Prisma client (or a small repository class). No HTTP types in model code. |
| **Contracts** | `packages/shared` | Zod schemas + shared types. Used by web, api, and worker. |
| **Jobs** | `apps/worker` `*.handler.ts` / cron | Thin entrypoints: parse job payload, call shared or api-local services, record results. No HTTP controllers. |

## NestJS module layout (required)

```
apps/api/src/<feature>/
  <feature>.module.ts
  <feature>.controller.ts   # thin
  <feature>.service.ts      # business logic
  dto/                      # request/response DTOs (or Zod from @repo/shared)
```

Example: `events.controller.ts` → `events.service.ts` → Prisma / Google clients.

## Worker layout (required)

```
apps/worker/src/<feature>/
  <feature>.handler.ts      # BullMQ processor — thin
  # Prefer importing domain services from a shared package or duplicating thin orchestration that calls the same Google/Meta clients
```

Handlers must not contain multi-step business logic inline; extract to a service class.

## Hard rules

- Controllers must not call Google Forms/Calendar/Gmail, Meta WhatsApp, or BullMQ directly — services do.
- Controllers must not embed email/WhatsApp template rendering or quota logic.
- Web components must not import `@prisma/client` or NestJS modules.
- Webhooks use controllers that verify signatures then enqueue or call an ingestion service — no registration business logic in the controller.
- Keep one feature = one NestJS module unless the master plan says otherwise.

## Anti-patterns

```typescript
// BAD — logic in controller
@Post()
async create(@Body() body) {
  const form = await formsApi.create(...);
  await prisma.event.create(...);
}

// GOOD — controller delegates
@Post()
create(@Body() body: CreateEventDto, @CurrentUser() user: User) {
  return this.eventsService.create(user.id, body);
}
```
