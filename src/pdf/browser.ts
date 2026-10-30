import { MODULE_ID } from "../constants.ts";
import { rawPageFromPdfjs } from "./from-pdfjs.ts";
import type { RawPage } from "./types.ts";

/**
 * pdf.js runs in the GM's browser. The PDF bytes never leave the machine;
 * only the text we extract later is sent to the AI provider the GM picked.
 *
 * Foundry ships its own PDF viewer, but that copy is not a stable public API,
 * so we bundle pdfjs-dist and its worker next to this module.
 */

interface PdfjsModule {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: Record<string, unknown>) => { promise: Promise<PdfjsDocument> };
}

interface PdfjsDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfjsPage>;
}

interface PdfjsPage {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<{ items: unknown[] }>;
}

export class PdfRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfRejected";
  }
}

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      const pdfjs = mod as unknown as PdfjsModule;
      // The worker file is copied beside dist/folio.js by the Vite build.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("./pdf.worker.min.mjs", import.meta.url).href;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export function rejectionMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const name = "name" in error ? String(error.name) : "";
  if (name === "PasswordException") {
    return "This PDF is password-protected or DRM-locked. Folio will not try to open it. Only import PDFs you own.";
  }
  return null;
}

export async function readPdfPages(
  data: Uint8Array,
  range: { start: number; end: number },
): Promise<RawPage[]> {
  const pdfjs = await loadPdfjs();
  const open = (disableWorker: boolean) => pdfjs.getDocument({
    data,
    isEvalSupported: false,
    disableWorker,
  }).promise;

  let doc: PdfjsDocument;
  try {
    doc = await open(false);
  } catch (error) {
    const rejected = rejectionMessage(error);
    if (rejected) throw new PdfRejected(rejected);
    // Some Foundry hosts refuse the module worker. Text extraction still works
    // on the main thread for a one-shot; we only fall back after the worker fails.
    try {
      doc = await open(true);
    } catch (second) {
      const again = rejectionMessage(second);
      if (again) throw new PdfRejected(again);
      throw second;
    }
  }

  const start = Math.max(1, Math.floor(range.start));
  const end = Math.min(doc.numPages, Math.floor(range.end));
  if (start > end || start > doc.numPages) {
    throw new PdfRejected(`Page range ${range.start}–${range.end} is outside this PDF (it has ${doc.numPages} pages).`);
  }

  const pages: RawPage[] = [];
  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push(rawPageFromPdfjs(
      pageNumber,
      viewport.width,
      viewport.height,
      content.items as { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string }[],
    ));
  }
  return pages;
}

/** Where the module expects to live. Used by settings copy, not by the worker URL. */
export const MODULE_FOLDER = `modules/${MODULE_ID}`;
