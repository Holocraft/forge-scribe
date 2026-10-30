import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { rawPageFromPdfjs, type PdfjsTextItem } from "../../src/pdf/from-pdfjs.ts";
import type { RawPage } from "../../src/pdf/types.ts";

export async function loadHuntedQueen(): Promise<RawPage[]> {
  const data = new Uint8Array(readFileSync("test-pdfs/hunted-queen.pdf"));
  const doc = await getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
  } as Parameters<typeof getDocument>[0]).promise;
  const pages: RawPage[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push(rawPageFromPdfjs(
      pageNumber,
      viewport.width,
      viewport.height,
      content.items as PdfjsTextItem[],
    ));
  }
  return pages;
}
