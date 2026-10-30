import type { RawItem, RawPage, TextLine } from "./types.ts";
import { normalizeSpaces } from "./cleanup.ts";

/**
 * Most 5e adventure PDFs are two columns. pdf.js returns every text fragment on
 * the page in no useful order, so we cluster left-edges, find the gutter, and
 * only then sort top-to-bottom. Reading the left column fully before the right
 * one matches how those books are set.
 */

const STRIP = 4;

/**
 * Project every glyph onto the x axis and look for a blank vertical gutter.
 * Clustering left-edges is not enough: a line that starts at the left margin
 * still has words whose left-edge sits near the middle of the column.
 */
export function columnBoundary(items: RawItem[], pageWidth: number): number | null {
  if (items.length < 4 || pageWidth <= 0) return null;
  const strips = Math.ceil(pageWidth / STRIP);
  const ink = new Array<number>(strips).fill(0);
  for (const item of items) {
    const start = Math.max(0, Math.floor(item.x / STRIP));
    const end = Math.min(strips - 1, Math.floor((item.x + Math.max(item.width, 1)) / STRIP));
    for (let index = start; index <= end; index += 1) ink[index] = (ink[index] ?? 0) + 1;
  }
  const min = Math.floor(strips * 0.3);
  const max = Math.floor(strips * 0.7);
  let bestWidth = 0;
  let bestAt = 0;
  let run = 0;
  let runStart = 0;
  const consider = () => {
    if (run === 0) return;
    const width = run * STRIP;
    const at = (runStart + run / 2) * STRIP;
    if (width >= 16 && width > bestWidth) {
      bestWidth = width;
      bestAt = at;
    }
  };
  for (let index = min; index <= max; index += 1) {
    if ((ink[index] ?? 0) === 0) {
      if (run === 0) runStart = index;
      run += 1;
    } else {
      consider();
      run = 0;
    }
  }
  consider();
  if (bestWidth === 0) return null;
  const splitAt = bestAt;
  const left = items.filter((item) => item.x < splitAt).length;
  const right = items.length - left;
  if (left < items.length * 0.2 || right < items.length * 0.2) return null;
  return splitAt;
}

/**
 * A drop cap is one huge letter whose baseline sits below the first line of the
 * paragraph ("Q" next to "ueen Kalia"). Glue it onto that line.
 */
export function absorbDropCaps(items: RawItem[]): RawItem[] {
  if (items.length === 0) return items;
  const heights = items.map((item) => item.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] || 10;
  const caps = items.filter((item) => /^[A-Z]$/.test(item.str.trim()) && item.height >= median * 3);
  if (caps.length === 0) return items;
  const removed = new Set(caps);
  const prefixes = new Map<RawItem, string>();
  for (const cap of caps) {
    const top = cap.y + cap.height;
    const candidates = items.filter((item) => {
      if (removed.has(item)) return false;
      if (item.height > median * 1.5) return false;
      if (item.y > top + 1 || item.y < cap.y - 2) return false;
      if (item.x < cap.x - 8 || item.x > cap.x + 180) return false;
      return true;
    });
    candidates.sort((a, b) => b.y - a.y || a.x - b.x);
    const target = candidates[0];
    if (!target) continue;
    prefixes.set(target, `${cap.str.trim()}${prefixes.get(target) ?? ""}`);
  }
  return items
    .filter((item) => !removed.has(item))
    .map((item) => (prefixes.has(item) ? { ...item, str: `${prefixes.get(item) ?? ""}${item.str}` } : item));
}

function clusterLines(items: RawItem[]): RawItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: RawItem[][] = [];
  for (const item of sorted) {
    const current = lines[lines.length - 1];
    const anchor = current?.[0];
    if (anchor && Math.abs(anchor.y - item.y) <= 2) current.push(item);
    else lines.push([item]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

function joinItems(items: RawItem[]): string {
  let text = "";
  for (const item of items) {
    const piece = item.str.replace(UNICODE_NEWLINES, " ");
    if (!piece) continue;
    if (!text) {
      text = piece;
      continue;
    }
    const needsSpace = !/\s$/.test(text) && !/^\s/.test(piece) && !/^[,.;:)\]%]/.test(piece);
    text += (needsSpace ? " " : "") + piece;
  }
  return normalizeSpaces(text);
}

const UNICODE_NEWLINES = /[\r\n]+/g;

function lineFromItems(items: RawItem[], page: number, column: number): TextLine | null {
  const text = joinItems(items);
  if (!text) return null;
  const fontSize = Math.max(...items.map((item) => item.height));
  const dominant = items.reduce((best, item) => (item.height > best.height ? item : best), items[0]);
  return {
    text,
    page,
    column,
    x: Math.min(...items.map((item) => item.x)),
    y: Math.max(...items.map((item) => item.y)),
    fontSize,
    fontName: dominant?.fontName ?? "",
    role: "body",
    inQuote: false,
  };
}

/** Split one page into reading-order lines. Column 0 is fully read before column 1. */
export function linesFromPage(page: RawPage): TextLine[] {
  const usable = page.items.filter((item) => item.str.trim() && item.height > 0);
  const boundary = columnBoundary(usable, page.width);
  const columns = boundary === null ? [usable] : [
    usable.filter((item) => item.x < boundary),
    usable.filter((item) => item.x >= boundary),
  ];
  const lines: TextLine[] = [];
  columns.forEach((items, column) => {
    const absorbed = absorbDropCaps(items);
    for (const group of clusterLines(absorbed)) {
      const line = lineFromItems(group, page.pageNumber, column);
      if (line) lines.push(line);
    }
  });
  return lines;
}

export function linesFromPages(pages: RawPage[]): TextLine[] {
  return [...pages]
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .flatMap((page) => linesFromPage(page));
}
