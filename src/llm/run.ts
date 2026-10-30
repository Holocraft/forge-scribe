import type { ZodType } from "zod";
import { extractJson, jsonCandidates } from "./json.ts";
import { retrySuffix } from "./prompts.ts";
import { formatZodError } from "./schema.ts";

export interface LlmClient {
  complete(system: string, user: string): Promise<string>;
}

/**
 * Parse a model response against a schema. One retry, with the validation
 * error pasted back, is enough for a missing comma or an extra Foundry key.
 */
export async function completeValidated<T>(
  client: LlmClient,
  schema: ZodType<T>,
  system: string,
  user: string,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  let prompt = user;
  let lastError = "The model returned nothing.";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let text = "";
    try {
      text = await client.complete(system, prompt);
      const parsed = extractJson(text);
      for (const candidate of jsonCandidates(parsed)) {
        const result = schema.safeParse(candidate);
        if (result.success) return { ok: true, value: result.data };
        lastError = formatZodError(result.error);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "The model response could not be read.";
    }
    prompt = `${user}${retrySuffix(lastError)}`;
  }
  return { ok: false, error: lastError };
}
