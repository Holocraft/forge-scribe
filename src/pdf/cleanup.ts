/**
 * Text cleanup that does not need Foundry or pdf.js.
 * Adventure PDFs hyphenate words at line ends and use unicode minus signs in modifiers.
 */

const UNICODE_SPACES = /[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g;

/** Turn non-breaking spaces into normal spaces and collapse runs of spaces. */
export function normalizeSpaces(text: string): string {
  return text.replace(UNICODE_SPACES, " ").replace(/[ \t]+/g, " ").trim();
}

/**
 * Stat-block math uses a unicode minus (−) or an en dash that regexes will miss.
 * Prose em dashes are left alone unless they sit next to a digit.
 */
export function normalizeNumericDashes(text: string): string {
  return text
    .replace(/\u2212/g, "-")
    .replace(/(\d)\u2013(\d)/g, "$1-$2")
    .replace(/([(+])\u2013/g, "$1-");
}

/**
 * Join a line that pdf.js broke with a hyphen onto the next line.
 *
 * "adven-" + "ture" becomes "adventure" (the hyphen was only a line break).
 * "5-year-" + "old" stays "5-year-old" because the fragment was already a compound.
 * Returns null when the lines should not be joined this way.
 */
export function joinHyphenBreak(previous: string, next: string): string | null {
  if (!previous.endsWith("-")) return null;
  const nextWord = next.match(/^[a-z]+/)?.[0];
  if (!nextWord) return null;
  const fragment = previous.slice(0, -1).match(/[A-Za-z0-9-]+$/)?.[0] ?? "";
  if (!fragment || !/[a-z]/i.test(fragment)) return null;
  const keepHyphen = fragment.includes("-");
  const stem = keepHyphen ? previous : previous.slice(0, -1);
  return stem + nextWord + next.slice(nextWord.length);
}

/** True when `next` is the wrapped continuation of `previous`, not a new paragraph. */
export function shouldJoinWrappedLines(previous: string, next: string, gap: number, fontSize: number): boolean {
  if (!previous || !next) return false;
  if (joinHyphenBreak(previous, next)) return true;
  // A much larger gap is a blank line, which is a real paragraph break.
  if (gap > Math.max(fontSize * 1.8, fontSize + 8)) return false;
  // "doom?" followed by "This is a short…" is a new paragraph even when the leading is tight.
  if (/[.!?]["”']?$/.test(previous) && /^[A-Z“"]/.test(next)) return false;
  return true;
}

/** Join an array of wrapped lines into paragraphs, dehyphenating as it goes. */
export function joinWrappedLines(lines: string[]): string {
  let result = "";
  for (const line of lines) {
    const cleaned = normalizeSpaces(line);
    if (!cleaned) continue;
    if (!result) {
      result = cleaned;
      continue;
    }
    const hyphenated = joinHyphenBreak(result, cleaned);
    if (hyphenated) {
      result = hyphenated;
      continue;
    }
    result = `${result} ${cleaned}`;
  }
  return normalizeSpaces(result);
}
