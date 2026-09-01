/**
 * The provider seam. Deliberately narrow: a provider turns a file into an
 * `Extraction` and reports progress while it works. Pure types — the interface
 * knows nothing about pdf.js, tesseract, React or the network.
 */

import type { Extraction } from "./types";

/**
 * The stages a provider moves through. `reading` covers decoding the file,
 * `ocr` the recognition pass, `matching` the rule pass.
 */
export type ExtractionPhase = "reading" | "ocr" | "matching";

/**
 * A real progress report. `ratio` is `0..1` within the run as a whole.
 *
 * Progress belongs in the interface because the local engine has a genuine
 * signal (tesseract's logger), so the UI must never fake one with a timer.
 */
export interface ExtractionProgress {
  phase: ExtractionPhase;
  /** Completed fraction of the whole run, `0..1`, monotonically increasing. */
  ratio: number;
}

/** How a provider reports progress back to its caller. */
export type ExtractionProgressCallback = (progress: ExtractionProgress) => void;

/** One extraction strategy. The only surface the state layer sees. */
export interface ExtractionProvider {
  /** Registry id, e.g. `local`. */
  readonly id: string;
  /** Human-readable name shown in the UI, e.g. `On-device OCR`. */
  readonly label: string;
  /** Rejects with an `ExtractionError` on failure. */
  extract(
    file: File,
    onProgress: ExtractionProgressCallback
  ): Promise<Extraction>;
}

/**
 * Constructs a provider. Providers are built on demand rather than at module
 * load so registering one costs nothing until it is used.
 */
export type ExtractionProviderFactory = () => ExtractionProvider;
