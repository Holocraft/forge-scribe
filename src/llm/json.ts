/**
 * Models often wrap JSON in markdown fences or a single envelope key.
 * We unwrap that, then the schema still has to accept the object.
 * A Foundry document does not become valid by being wrapped.
 */

export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (inner === null) continue;
    output[key] = stripNulls(inner);
  }
  return output;
}

/** Pull the first JSON object or array out of a model response. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? trimmed).trim();
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error("The model did not return JSON.");
  return JSON.parse(body.slice(start)) as unknown;
}

/** Values worth trying against the schema, outermost first. */
export function jsonCandidates(value: unknown): unknown[] {
  const cleaned = stripNulls(value);
  const candidates = [cleaned];
  if (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned)) {
    const keys = Object.keys(cleaned);
    if (keys.length === 1) {
      const only = keys[0];
      if (only) candidates.push(stripNulls((cleaned as Record<string, unknown>)[only]));
    }
  }
  if (Array.isArray(cleaned) && cleaned.length === 1) candidates.push(stripNulls(cleaned[0]));
  return candidates;
}
