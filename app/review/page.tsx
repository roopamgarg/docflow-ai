"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { useDocument } from "@/lib/document-context";

/**
 * The review route. Placeholder body: the document viewer is ticket 012, the
 * highlight overlay 013 and the extraction panel 014 — all of them read this
 * page's state through `useDocument()`.
 *
 * The guard is the point of this file. Nothing is persisted, so a hard refresh
 * or a pasted link arrives with `doc === null`; that tab belongs on the landing
 * page. `router.replace` runs in an effect (navigation cannot happen during
 * render) and the early `return null` covers the frame or two before it lands,
 * so an empty shell never flashes on the way out.
 */
export default function ReviewPage() {
  const { doc } = useDocument();
  const router = useRouter();

  useEffect(() => {
    if (!doc) router.replace("/");
  }, [doc, router]);

  if (!doc) return null;

  return (
    <AppShell title="Review extraction">
      <p className="text-body text-muted-foreground">{doc.name}</p>
    </AppShell>
  );
}
