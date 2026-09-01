import { notFound } from "next/navigation";

import { DemoInvoice } from "@/components/viewer/DemoInvoice";

/**
 * The capture harness for `public/demo-invoice.png` — a development-only route.
 *
 * The demo asset has to be regenerable from the component rather than hand-kept
 * in step with it, so the component needs somewhere to be rendered at its
 * capture size. That is all this route is: `DemoInvoice` alone on the page, no
 * chrome, no padding, so a full-page screenshot is exactly the sheet.
 *
 * It 404s outside development. The demo is an asset, not a screen, and shipping
 * a URL that serves a fake invoice would be a second, confusing way into the
 * product. The `agent-browser` command that turns this page into the PNG is
 * recorded in `tasks/015-demo-invoice/status.md`.
 */
export default function DemoInvoiceCapturePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <>
      {/*
        The dev overlay renders into a `nextjs-portal` element on `body`, and a
        full-page screenshot would otherwise capture its badge as part of the
        invoice. Scoped here rather than turned off in `next.config.ts`, which
        would take the indicator away from every other screen too.
      */}
      <style>{"nextjs-portal{display:none!important}"}</style>
      <DemoInvoice />
    </>
  );
}
