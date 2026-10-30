import type { LineRole, TextLine } from "./types.ts";

/**
 * Headings are just larger type. We rank font sizes per page instead of trusting
 * one book's stylesheet. "Actions" inside a stat block is large-ish but it is a
 * label, not a scene title, so it is tagged separately.
 */

const STAT_LABEL = /^(actions|bonus actions|reactions|legendary actions|lair actions|mythic actions|traits)$/i;

function bodySize(lines: TextLine[]): number {
  const counts = new Map<number, number>();
  for (const line of lines) {
    const size = Math.round(line.fontSize);
    // Ignore display type when deciding what "body" is.
    if (size >= 18) continue;
    counts.set(size, (counts.get(size) ?? 0) + line.text.length);
  }
  let bestSize = 10;
  let bestCount = -1;
  for (const [size, count] of counts) {
    if (count > bestCount || (count === bestCount && size < bestSize)) {
      bestSize = size;
      bestCount = count;
    }
  }
  return bestSize;
}

export function assignRoles(lines: TextLine[]): TextLine[] {
  const byPage = new Map<number, TextLine[]>();
  for (const line of lines) {
    const group = byPage.get(line.page) ?? [];
    group.push(line);
    byPage.set(line.page, group);
  }
  const bodyByPage = new Map<number, number>();
  for (const [page, group] of byPage) bodyByPage.set(page, bodySize(group));

  return lines.map((line) => {
    const body = bodyByPage.get(line.page) ?? 10;
    const role = roleFor(line, body);
    return role === line.role ? line : { ...line, role };
  });
}

function roleFor(line: TextLine, body: number): LineRole {
  if (STAT_LABEL.test(line.text.trim())) return "stat-label";
  if (line.text.length > 90) return "body";
  if (line.fontSize >= 24 && line.fontSize >= body * 2) return "title";
  if (line.fontSize >= body * 1.6 && line.fontSize >= body + 4) return "heading";
  if (line.fontSize >= body * 1.22 && line.fontSize >= body + 2) return "subheading";
  return "body";
}

/** Track straight and curly quotes so a letter that wraps for many lines stays marked. */
export function markQuotations(lines: TextLine[]): TextLine[] {
  let open = false;
  return lines.map((line) => {
    const marks = line.text.match(/["“”]/g)?.length ?? 0;
    const inQuote = open || /["“]/.test(line.text);
    if (marks % 2 === 1) open = !open;
    // A line that both opens and closes (a one-line quotation) is still quoted.
    const closesHere = marks % 2 === 1 && !open;
    return { ...line, inQuote: inQuote || closesHere };
  });
}
