import { FileUp, Gauge, PenLine, ShieldCheck } from "lucide-react";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { UploadDropzone } from "@/components/upload/UploadDropzone";

/**
 * The landing route — the marketing surface.
 *
 * Deliberately plain chrome: cream page, `SiteHeader`, and no icon rail or
 * floating shell. That chrome belongs to `AppShell` on `/review` and
 * `/success`, and keeping it off this page is what makes the review screen read
 * as a tool rather than a continuation of the pitch.
 *
 * A server component. The one interactive piece is `UploadDropzone`, which is
 * the client island that reaches the state layer through `useDocument()`; the
 * processing state that replaces it is ticket 011's.
 */

/** The pitch, in the order the human will actually experience it. */
const STEPS = [
  {
    icon: FileUp,
    title: "Upload a document",
    body: "Drop a PDF, PNG or JPG. Digital PDFs are read through their text layer; scans and photos go through OCR.",
  },
  {
    icon: Gauge,
    title: "Fields are extracted",
    body: "Every field arrives with a measured confidence score and a highlight on the page it came from.",
  },
  {
    icon: PenLine,
    title: "You verify and approve",
    body: "Correct anything the extraction got wrong, approve each field, then export clean JSON.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <SiteHeader />

      <main className="flex-1">
        {/* `#upload` is the target of the header's primary action. */}
        <section
          id="upload"
          aria-labelledby="hero-title"
          className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 pt-14 pb-16 sm:pt-20 lg:px-8"
        >
          <div className="flex flex-col items-center gap-5 text-center">
            <p className="inline-flex items-center gap-2 rounded-4xl bg-inset px-3.5 py-1.5 text-label font-medium text-foreground">
              <ShieldCheck aria-hidden className="size-4 text-primary" />
              Runs entirely in your browser — nothing is uploaded.
            </p>

            <h1
              id="hero-title"
              className="text-display text-balance text-foreground"
            >
              Turn documents into structured data
            </h1>

            <p className="max-w-xl text-subtitle text-pretty text-muted-foreground">
              Upload an invoice and every field comes back with a confidence
              score and its place on the page. You verify, correct and approve
              before anything is exported.
            </p>
          </div>

          <div className="mt-10 flex justify-center sm:mt-12">
            <UploadDropzone />
          </div>
        </section>

        {/* The anchor behind `How it works` in the header. */}
        <section
          id="how-it-works"
          aria-labelledby="how-it-works-title"
          className="scroll-mt-20 border-t border-border"
        >
          <div className="mx-auto w-full max-w-5xl px-4 py-16 lg:px-8">
            <h2
              id="how-it-works-title"
              className="text-headline text-foreground"
            >
              How it works
            </h2>
            <p className="mt-2 max-w-xl text-body text-muted-foreground">
              Three steps, no account and no server. Extraction runs in this
              tab, so your document never leaves the machine you opened it on.
            </p>

            <ol className="mt-8 grid gap-4 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, index) => (
                <li
                  key={title}
                  className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card"
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center rounded-control bg-inset text-primary"
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <span className="text-micro font-semibold uppercase text-muted-foreground tabular-figures">
                      Step {index + 1}
                    </span>
                  </span>

                  <span className="text-subtitle font-semibold text-foreground">
                    {title}
                  </span>
                  <span className="text-body text-muted-foreground">
                    {body}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </div>
  );
}
