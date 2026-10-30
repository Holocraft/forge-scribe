import type { ExtractedDocument } from "../pdf/types.ts";

/** Markdown-ish text for the structure prompt. Headings carry page numbers. */
export function formatProse(extracted: ExtractedDocument): string {
  const lines: string[] = [];
  for (const paragraph of extracted.paragraphs) {
    if (paragraph.role === "title") continue;
    if (paragraph.role === "heading") {
      lines.push(`\n# ${paragraph.text} (page ${paragraph.page})`);
      continue;
    }
    if (paragraph.role === "subheading") {
      lines.push(`\n## ${paragraph.text} (page ${paragraph.page})`);
      continue;
    }
    lines.push(paragraph.readAloud ? `> ${paragraph.text}` : paragraph.text);
  }
  if (extracted.statBlocks.length > 0) {
    lines.push("\n# Stat blocks already extracted");
    for (const block of extracted.statBlocks) {
      lines.push(`- ${block.id}: ${block.name} (page ${block.page})`);
    }
  }
  return lines.join("\n").trim();
}

/** Split on top-level headings so a long adventure is several smaller requests. */
export function splitProse(text: string, maxChars = 14000): string[] {
  if (text.length <= maxChars) return [text];
  const pieces = text.split(/\n(?=# )/);
  const chunks: string[] = [];
  let current = "";
  const pushPiece = (piece: string) => {
    if (piece.length <= maxChars) {
      chunks.push(piece);
      return;
    }
    for (let index = 0; index < piece.length; index += maxChars) {
      chunks.push(piece.slice(index, index + maxChars));
    }
  };
  for (const piece of pieces) {
    const next = current ? `${current}\n${piece}` : piece;
    if (current && next.length > maxChars) {
      pushPiece(current);
      current = piece.length > maxChars ? "" : piece;
      if (piece.length > maxChars) pushPiece(piece);
      continue;
    }
    if (next.length > maxChars) {
      pushPiece(piece);
      current = "";
      continue;
    }
    current = next;
  }
  if (current) chunks.push(current);
  return chunks.filter((chunk) => chunk.trim().length > 0);
}

export const MAX_AI_CHUNKS = 16;
