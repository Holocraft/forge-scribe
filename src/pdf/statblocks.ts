import type { StatBlock, TextLine } from "./types.ts";
import { joinWrappedLines, normalizeNumericDashes, normalizeSpaces } from "./cleanup.ts";

/**
 * A 5e stat block is recognizable without an LLM: a short heading, then
 * "Armor Class" or "AC", then hit points and the STR DEX CON row.
 * Everything between that heading and the next scene heading is the block.
 */

const ARMOR = /^(armor class|ac)\b/i;
const HIT_POINTS = /hit points|\bhp\b/i;
const ABILITY_HEADER = /STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA/i;

const HEADER_LINE = new RegExp(
  [
    "^(armor class|hit points|speed|skills|senses|languages|challenge)\\b",
    "^saving throws\\s+(str|dex|con|int|wis|cha|strength|dexterity)\\b",
    "^(damage (resistances|immunities|vulnerabilities)|condition immunities)\\b",
    "^ac\\b",
    "^hp\\b",
  ].join("|"),
  "i",
);

/** "Stab. Melee…" starts a feature. "saving throws against…" does not. */
function isFeatureStart(text: string): boolean {
  return /^[A-Z][A-Za-z'’ -]{0,40}\.\s+\S/.test(text);
}

export function slugId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "stat-block";
}

function isBlockHeading(line: TextLine): boolean {
  return line.role === "heading" || line.role === "title";
}

export function findStatBlocks(lines: TextLine[]): { blocks: StatBlock[]; consumed: Set<number> } {
  const consumed = new Set<number>();
  const blocks: StatBlock[] = [];
  const usedIds = new Map<string, number>();

  for (let index = 0; index < lines.length; index += 1) {
    if (consumed.has(index)) continue;
    const line = lines[index];
    if (!line || !ARMOR.test(line.text.trim())) continue;

    let nameIndex = -1;
    for (let back = index - 1; back >= Math.max(0, index - 8); back -= 1) {
      const candidate = lines[back];
      if (!candidate || candidate.page !== line.page || candidate.column !== line.column) break;
      if (!isBlockHeading(candidate)) continue;
      nameIndex = back;
      break;
    }
    if (nameIndex < 0) continue;

    const nameLine = lines[nameIndex];
    if (!nameLine) continue;
    let end = lines.length;
    for (let forward = index + 1; forward < lines.length; forward += 1) {
      const candidate = lines[forward];
      if (!candidate || candidate.page !== nameLine.page || candidate.column !== nameLine.column) {
        end = forward;
        break;
      }
      if (isBlockHeading(candidate) && candidate.fontSize >= nameLine.fontSize - 1) {
        end = forward;
        break;
      }
    }

    const slice = lines.slice(nameIndex, end);
    const blob = slice.map((entry) => entry.text).join("\n");
    if (!HIT_POINTS.test(blob) || !ABILITY_HEADER.test(blob)) continue;

    for (let mark = nameIndex; mark < end; mark += 1) consumed.add(mark);
    const name = normalizeSpaces(nameLine.text);
    let id = slugId(name);
    const seen = usedIds.get(id) ?? 0;
    usedIds.set(id, seen + 1);
    if (seen > 0) id = `${id}-${seen + 1}`;

    blocks.push({
      id,
      name,
      page: nameLine.page,
      lines: slice.map((entry) => normalizeNumericDashes(entry.text)),
      text: flowStatBlock(slice),
    });
  }

  return { blocks, consumed };
}

/**
 * Keep header rows on their own lines (the deterministic parser keys off them)
 * and join the wrapped description of each trait onto one line.
 */
export function flowStatBlock(slice: TextLine[]): string {
  const output: string[] = [];
  let pending: string[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    output.push(normalizeNumericDashes(joinWrappedLines(pending)));
    pending = [];
  };
  for (const line of slice) {
    const text = normalizeNumericDashes(line.text.trim());
    const isHeader = line.role === "stat-label"
      || line.role === "heading"
      || line.role === "title"
      || HEADER_LINE.test(text)
      || ABILITY_HEADER.test(text)
      || /^(\d+\s*\([+-]?\d+\)\s+){3,}/.test(text);
    if (isHeader) {
      flush();
      output.push(text);
      continue;
    }
    if (pending.length > 0 && !isFeatureStart(text)) {
      pending.push(text);
      continue;
    }
    flush();
    pending.push(text);
  }
  flush();
  return output.join("\n");
}
