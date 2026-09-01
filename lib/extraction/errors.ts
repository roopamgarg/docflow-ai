/**
 * The error vocabulary every provider maps onto, so the UI renders a failure
 * identically whatever engine produced it. Pure — no React, no I/O.
 */

/** Every failure a provider may surface. Providers map their own errors here. */
export const EXTRACTION_ERROR_CODES = [
  /** Not a PDF/PNG/JPEG. Rejected before any parsing work. */
  "unsupported_media",
  /** Over the size budget. Rejected before any parsing work. */
  "too_large",
  /** The bytes could not be decoded as the media type claims. */
  "unreadable",
  /** Decoded fine, but yielded no usable text — the likeliest real failure. */
  "no_text_found",
  /** Anything unexpected, including programmer error. */
  "internal",
] as const;

export type ExtractionErrorCode = (typeof EXTRACTION_ERROR_CODES)[number];

/** Fallback copy, used when a throw site supplies no message. */
const DEFAULT_MESSAGES: Record<ExtractionErrorCode, string> = {
  unsupported_media: "That file type isn't supported. Use a PDF, PNG or JPEG.",
  too_large: "That file is too large to process.",
  unreadable: "We couldn't read that file. It may be damaged.",
  no_text_found: "We couldn't find any readable text in that document.",
  internal: "Something went wrong while processing that document.",
};

/** A failure carrying a normalised `code` the UI can branch on. */
export class ExtractionError extends Error {
  readonly code: ExtractionErrorCode;

  constructor(
    code: ExtractionErrorCode,
    message: string = DEFAULT_MESSAGES[code],
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "ExtractionError";
    this.code = code;
  }
}

/** Narrow an unknown thrown value — `catch` gives `unknown`, not `Error`. */
export function isExtractionError(value: unknown): value is ExtractionError {
  return value instanceof ExtractionError;
}
