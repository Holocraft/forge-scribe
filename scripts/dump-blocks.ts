import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractDocument } from "../src/pdf/extract.ts";
import { rawPageFromPdfjs, type PdfjsTextItem } from "../src/pdf/from-pdfjs.ts";

const data = new Uint8Array(readFileSync("test-pdfs/hunted-queen.pdf"));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
const pages = [];
for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  pages.push(rawPageFromPdfjs(pageNumber, viewport.width, viewport.height, content.items as PdfjsTextItem[]));
}
const extracted = extractDocument(pages);
for (const block of extracted.statBlocks) {
  console.log(`\n===== ${block.name} =====\n`);
  console.log(block.text);
}
