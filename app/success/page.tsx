"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { SuccessState } from "@/components/success/SuccessState";
import { useDocument } from "@/lib/document-context";

/**
 * The success route: the confirmation card, the JSON export and the way back to
 * an empty desk. All of it is `SuccessState`; this file is the shell and the
 * guard.
 *
 * Same guard as `/review`, for the same reason: with no document in state there
 * is nothing to confirm, so a reloaded tab is replaced back to the landing page
 * and renders nothing while it goes. It doubles as the exit for `Process
 * another document`, which drops the document and lets this effect navigate.
 *
 * The document's name is the shell's title rather than the confirmation copy —
 * the card already says `Document approved`, and repeating it in the chrome
 * would waste the one line that tells the human which file they just finished.
 */
export default function SuccessPage() {
  const { doc } = useDocument();
  const router = useRouter();

  useEffect(() => {
    if (!doc) router.replace("/");
  }, [doc, router]);

  if (!doc) return null;

  return (
    <AppShell title={doc.name}>
      <SuccessState />
    </AppShell>
  );
}
