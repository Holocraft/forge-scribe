import { joinHyphenBreak, shouldJoinWrappedLines } from "./cleanup.ts";
import { linesFromPages } from "./columns.ts";
import { assignRoles, markQuotations } from "./headings.ts";
import { findStatBlocks } from "./statblocks.ts";
import type { ExtractedDocument, ProseParagraph, RawPage, TextLine } from "./types.ts";

const SPARSE_CHAR_LIMIT = 40;

/**
 * Turn pdf.js pages into prose paragraphs plus stat blocks.
 * Pure function: no network, no Foundry, so the unit tests can run in Node.
 */
export function extractDocument(pages: RawPage[]): ExtractedDocument {
  const warnings: string[] = [];
  const sparsePages: number[] = [];
  for (const page of pages) {
    const chars = page.items.reduce((sum, item) => sum + item.str.trim().length, 0);
    if (chars < SPARSE_CHAR_LIMIT) sparsePages.push(page.pageNumber);
  }
  if (sparsePages.length === pages.length && pages.length > 0) {
    warnings.push(
      `No text layer on page ${sparsePages.join(", ")}. Folio does not OCR scans. Export a text PDF, or type the stat blocks in by hand.`,
    );
  } else if (sparsePages.length > 0) {
    warnings.push(
      `Page ${sparsePages.join(", ")} has almost no text. Those pages were skipped. Scanned pages need OCR, which this version does not do.`,
    );
  }

  const readable = pages.filter((page) => !sparsePages.includes(page.pageNumber));
  const lined = markQuotations(assignRoles(linesFromPages(readable)));
  const { blocks, consumed } = findStatBlocks(lined);
  const proseLines = lined.filter((_, index) => !consumed.has(index));
  const title = lined.find((line) => line.role === "title")?.text
    ?? proseLines.find((line) => line.role === "heading")?.text
    ?? "Imported adventure";

  return {
    title,
    pageCount: pages.length,
    sparsePages,
    lines: lined,
    proseLines,
    paragraphs: paragraphsFromLines(proseLines),
    statBlocks: blocks,
    warnings,
  };
}

export function paragraphsFromLines(lines: TextLine[]): ProseParagraph[] {
  const paragraphs: ProseParagraph[] = [];
  let buffer: TextLine[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const first = buffer[0];
    if (!first) return;
    paragraphs.push({
      text: joinBody(buffer),
      page: first.page,
      readAloud: buffer.some((line) => line.inQuote),
      role: first.role,
    });
    buffer = [];
  };

  for (const line of lines) {
    if (line.role !== "body") {
      flush();
      paragraphs.push({
        text: line.text,
        page: line.page,
        readAloud: false,
        role: line.role,
      });
      continue;
    }
    const previous = buffer[buffer.length - 1];
    if (!previous) {
      buffer.push(line);
      continue;
    }
    const gap = previous.y - line.y;
    const sameColumn = previous.page === line.page && previous.column === line.column;
    if (sameColumn && shouldJoinWrappedLines(previous.text, line.text, gap, previous.fontSize)) {
      buffer.push(line);
      continue;
    }
    flush();
    buffer.push(line);
  }
  flush();
  return paragraphs;
}

function joinBody(lines: TextLine[]): string {
  let text = "";
  for (const line of lines) {
    if (!text) {
      text = line.text;
      continue;
    }
    const joined = joinHyphenBreak(text, line.text);
    text = joined ?? `${text} ${line.text}`;
  }
  return text.replace(/[ \t]+/g, " ").trim();
}
