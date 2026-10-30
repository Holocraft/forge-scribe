/**
 * Match a name from a PDF to a compendium entry.
 * Monsters match exactly or by a simple plural ("Goblins" -> "Goblin").
 * Gear and spells may also match a longer official name when that match is unique
 * ("studded leather" -> "Studded Leather Armor").
 */

export type MatchMode = "monster" | "gear" | "spell";

export interface NameMatch {
  name: string;
  quality: "exact" | "plural" | "fuzzy";
  note: string;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function singularize(name: string): string {
  const parts = name.split(" ");
  const last = parts[parts.length - 1] ?? "";
  let singular = last;
  if (last.endsWith("ves") && last.length > 4) singular = `${last.slice(0, -3)}f`;
  else if (last.endsWith("ies") && last.length > 4) singular = `${last.slice(0, -3)}y`;
  else if (last.endsWith("es") && last.length > 4 && !last.endsWith("ss")) singular = last.slice(0, -2);
  else if (last.endsWith("s") && !last.endsWith("ss") && last.length > 3) singular = last.slice(0, -1);
  parts[parts.length - 1] = singular;
  return parts.join(" ");
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(current + 1, (row[j - 1] ?? 0) + 1, previous + cost);
      previous = current;
    }
  }
  return row[b.length] ?? 3;
}

export function matchCompendiumName(query: string, candidates: string[], mode: MatchMode): NameMatch | null {
  const normalizedQuery = normalizeName(query);
  if (!normalizedQuery) return null;
  const byNormal = new Map<string, string>();
  for (const candidate of candidates) {
    const key = normalizeName(candidate);
    if (key && !byNormal.has(key)) byNormal.set(key, candidate);
  }

  const exact = byNormal.get(normalizedQuery);
  if (exact) return { name: exact, quality: "exact", note: "" };

  const singularQuery = singularize(normalizedQuery);
  const plural = byNormal.get(singularQuery);
  if (plural && singularQuery !== normalizedQuery) {
    return { name: plural, quality: "plural", note: `Matched “${query}” to “${plural}”.` };
  }
  for (const [key, candidate] of byNormal) {
    if (singularize(key) === normalizedQuery && key !== normalizedQuery) {
      return { name: candidate, quality: "plural", note: `Matched “${query}” to “${candidate}”.` };
    }
  }

  if (mode === "gear" || mode === "spell") {
    // "studded leather" matches only "Studded Leather Armor".
    // "leather" also sits inside "Studded Leather Armor", so that query is ambiguous.
    const contained = [...byNormal.entries()].filter(([key]) => (
      key === normalizedQuery
      || key.startsWith(`${normalizedQuery} `)
      || key.endsWith(` ${normalizedQuery}`)
      || key.includes(` ${normalizedQuery} `)
    ));
    if (contained.length === 1 && normalizedQuery.length >= 4) {
      const hit = contained[0]?.[1];
      if (hit) return { name: hit, quality: "fuzzy", note: `Matched “${query}” to “${hit}”.` };
    }
  }

  if (normalizedQuery.length < 6) return null;
  const close = [...byNormal.entries()]
    .map(([key, candidate]) => ({ candidate, distance: levenshtein(normalizedQuery, key) }))
    .filter((entry) => entry.distance === 1);
  if (close.length === 1) {
    const hit = close[0]?.candidate;
    if (hit) return { name: hit, quality: "fuzzy", note: `Fuzzy-matched “${query}” to “${hit}”.` };
  }
  return null;
}
