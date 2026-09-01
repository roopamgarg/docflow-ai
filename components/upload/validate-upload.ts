/**
 * The upload card's client-side file check — pure, so it is testable without a
 * DOM and cannot drift from the copy the card renders.
 *
 * This is an affordance, not the gate. `validateFile` in the local provider
 * re-checks the same two things before a byte is parsed, so the thresholds are
 * imported from there rather than restated here: a drifted copy would either
 * refuse files the engine accepts or promise ones it refuses, and both read as
 * a broken app.
 */

import {
  MAX_FILE_BYTES,
  resolveMediaType,
} from "@/lib/extraction/providers/local";

/** The size budget in whole megabytes, for copy. Derived, never typed twice. */
export const MAX_FILE_MB = Math.round(MAX_FILE_BYTES / 1024 ** 2);

/** Sits under the button: the two rules, before a file is chosen. */
export const HELPER_TEXT = `PDF, PNG or JPG · Max ${MAX_FILE_MB}MB`;

/**
 * Why this file cannot be used, or `null` when it can.
 *
 * Checked in the same order as the provider: type first, so a 40 MB spreadsheet
 * is reported as the wrong *kind* of file rather than a big one.
 */
export function rejectUpload(file: File): string | null {
  if (resolveMediaType(file) === null) {
    return `${file.name} isn't a supported file type. Choose a PDF, PNG or JPG.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    const megabytes = (file.size / 1024 ** 2).toFixed(1);
    return `${file.name} is ${megabytes}MB. The limit is ${MAX_FILE_MB}MB.`;
  }
  return null;
}
