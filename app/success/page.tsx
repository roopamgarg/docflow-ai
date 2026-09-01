"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { useDocument } from "@/lib/document-context";

/**
 * The success route. Placeholder body: the confirmation panel, the JSON export
 * and `Process another document` are ticket 016's.
 *
 * Same guard as `/review`, for the same reason: with no document in state there
 * is nothing to confirm, so a reloaded tab is replaced back to the landing page
 * and renders nothing while it goes.
 */
export default function SuccessPage() {
  const { doc } = useDocument();
  const router = useRouter();

  useEffect(() => {
    if (!doc) router.replace("/");
  }, [doc, router]);

  if (!doc) return null;

  return (
    <AppShell title="Document approved">
      <p className="text-body text-muted-foreground">{doc.name}</p>
    </AppShell>
  );
}
