import type { RawItem, RawPage } from "./types.ts";

/**
 * The slice of a pdf.js text item we depend on. Both the browser build and the
 * Node test loader convert into RawPage through here, so layout code never
 * imports pdf.js itself.
 */
export interface PdfjsTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  fontName?: string;
}

export function rawPageFromPdfjs(
  pageNumber: number,
  width: number,
  height: number,
  items: PdfjsTextItem[],
): RawPage {
  const raw: RawItem[] = [];
  for (const item of items) {
    if (!item.str || !item.transform) continue;
    raw.push({
      str: item.str,
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      width: item.width ?? 0,
      height: item.height ?? 0,
      fontName: item.fontName ?? "",
    });
  }
  return { pageNumber, width, height, items: raw };
}
