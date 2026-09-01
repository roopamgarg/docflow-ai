# Architecture Layers

DocFlow is a **single Next.js app (App Router) that runs entirely in the browser**. There is no API server, no database, and no job queue — document extraction happens client-side and nothing leaves the machine. Preserve these boundaries in every ticket.

## Mapping

| Concern | Location | Responsibility |
|---------|----------|----------------|
| **View** | `app/`, `components/` | UI only. Render state, dispatch intent. No field rules, no confidence math, no extraction. |
| **State** | `lib/document-context.tsx` | Client state: document, fields, status, edits, approvals, active field. React context + reducer — no domain logic. |
| **Service (domain)** | `lib/extraction/providers/` | All extraction logic. Pure and deterministic wherever possible; side effects (workers, canvas) isolated at the edges. |
| **Contracts** | `lib/extraction/types.ts`, `lib/extraction/provider.ts`, `lib/extraction/errors.ts` | Shared types, the provider interface, the error vocabulary. No UI or React types. |
| **Mapping** | `lib/extraction/fields.ts`, `lib/export.ts` | Domain → display model, domain → export JSON. Pure functions. |
| **Registry** | `lib/extraction/registry.ts` | The only module that knows provider ids and how to construct providers. |
| **Controller / Jobs** | n/a | There is no server and no worker. Do not introduce route handlers or background queues without a ticket that says so. |

## App layout (required)

```
app/                       # routes, layouts, pages — thin
components/
  ui/                      # shadcn primitives (button, card, input, badge, progress, separator, label)
  <feature>.tsx            # presentational + container components
lib/
  document-context.tsx     # client state
  export.ts                # domain → export JSON
  utils.ts                 # cn() helper only
  extraction/
    types.ts               # domain types
    provider.ts            # provider interface
    errors.ts              # error vocabulary
    fields.ts              # domain → display mapping
    registry.ts            # provider ids → provider instances
    providers/<name>.ts    # one provider per extraction strategy
scripts/copy-assets.mjs    # vendors pdf.js / tesseract runtime assets into public/
```

Example: `components/upload-panel.tsx` → `lib/document-context.tsx` → `lib/extraction/registry.ts` → `lib/extraction/providers/*`.

## Hard rules

- **No network calls anywhere.** No `fetch`/`XMLHttpRequest` to a remote host, no analytics, no model APIs. Runtime assets are vendored into `public/` by `scripts/copy-assets.mjs`; this offline guarantee is a product requirement, not a preference.
- `tesseract.js` must not be imported outside `lib/extraction/`. Components never touch OCR directly.
- `pdfjs-dist` may be imported by a component **only for rendering** (`PdfCanvas`), never for extraction. Extraction-side PDF parsing lives in `lib/extraction/`.
- Only `lib/extraction/registry.ts` knows provider ids. Components and state select a provider by id through the registry; they never `import` a provider module directly.
- Components must not compute confidence, validate field shapes, or normalize extracted values — that is the domain layer's job. Components consume the display model from `lib/extraction/fields.ts`.
- `lib/extraction/**` must not import from `app/`, `components/`, or `lib/document-context.tsx`. The domain layer knows nothing about React.
- `canvas` and `encoding` stay aliased to `false` in `next.config.ts`. Never add the optional Node `canvas` package as a real dependency.
- One extraction strategy = one file under `lib/extraction/providers/`, registered in `registry.ts`.

## Anti-patterns

```typescript
// BAD — extraction logic in a component
export function UploadPanel() {
  const onFile = async (file: File) => {
    const worker = await createWorker("eng");            // tesseract in the View layer
    const { data } = await worker.recognize(file);
    const invoiceNo = data.text.match(/INV-\d+/)?.[0];   // field rules in the View layer
    setFields([{ key: "invoiceNumber", value: invoiceNo, confidence: 0.9 }]);
  };
}

// GOOD — component delegates to the domain layer through state
export function UploadPanel() {
  const { ingest } = useDocument();
  const onFile = (file: File) => ingest(file);           // registry → provider → fields
}
```

```typescript
// BAD — component reaches past the registry, and phones home
import { ocrProvider } from "@/lib/extraction/providers/ocr";
await fetch("https://api.example.com/extract", { method: "POST", body: file });

// GOOD
import { getProvider } from "@/lib/extraction/registry";
const provider = getProvider("ocr");
```
