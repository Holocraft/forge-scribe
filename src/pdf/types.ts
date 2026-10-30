/**
 * A single text fragment from pdf.js, already translated out of PDF's transform matrix.
 * PDF coordinates grow upward, so a larger `y` is higher on the page.
 */
export interface RawItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
}

export interface RawPage {
  pageNumber: number;
  width: number;
  height: number;
  items: RawItem[];
}

export type LineRole = "title" | "heading" | "subheading" | "stat-label" | "body";

/** One visual line after column sorting. This is the unit the rest of the pipeline uses. */
export interface TextLine {
  text: string;
  page: number;
  /** 0 is the left column (or the only column). */
  column: number;
  x: number;
  y: number;
  fontSize: number;
  fontName: string;
  role: LineRole;
  /** True when the line sits inside a quotation that started on an earlier line. */
  inQuote: boolean;
}

export interface StatBlock {
  id: string;
  name: string;
  page: number;
  /** Visual lines, still separated, so "Armor Class 13" stays intact. */
  lines: string[];
  /** The same text with wrapped lines joined. The stat-block parser reads this. */
  text: string;
}

export interface ProseParagraph {
  text: string;
  page: number;
  readAloud: boolean;
  role: LineRole;
}

export interface ExtractedDocument {
  title: string;
  pageCount: number;
  /** Pages the GM asked for that contained almost no text. */
  sparsePages: number[];
  lines: TextLine[];
  /** Lines that are not part of a stat block, in reading order. */
  proseLines: TextLine[];
  paragraphs: ProseParagraph[];
  statBlocks: StatBlock[];
  warnings: string[];
}
