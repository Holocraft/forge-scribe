import { ANTHROPIC_URL, DEFAULT_MODELS, OLLAMA_DEFAULT_URL, OPENAI_URL } from "../constants.ts";

/**
 * Provider calls run in the GM's browser. The API key is a header, never part of
 * the URL, and the helpers below are shaped so a future hosted tier can be
 * another provider id that posts the same JSON to our server instead.
 *
 * A hosted provider would set mode to "hosted". The wizard already branches on
 * `needsApiKey`, so it would not ask the GM for an OpenAI key.
 */

export type ProviderId = "openai" | "anthropic" | "ollama";

export interface LlmProvider {
  id: ProviderId;
  label: string;
  mode: "byok" | "hosted";
  needsApiKey: boolean;
  defaultModel: string;
}

export const PROVIDERS: LlmProvider[] = [
  { id: "openai", label: "OpenAI", mode: "byok", needsApiKey: true, defaultModel: DEFAULT_MODELS.openai },
  { id: "anthropic", label: "Anthropic", mode: "byok", needsApiKey: true, defaultModel: DEFAULT_MODELS.anthropic },
  { id: "ollama", label: "Ollama (local)", mode: "byok", needsApiKey: false, defaultModel: DEFAULT_MODELS.ollama },
];

export function providerById(id: string): LlmProvider {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];
}

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

function wantsTemperature(model: string): boolean {
  return !/\b(o1|o3|o4|gpt-5)\b/i.test(model);
}

export function buildOpenAiRequest(options: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}): ProviderRequest {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
    response_format: { type: "json_object" },
    max_tokens: options.maxTokens,
  };
  if (wantsTemperature(options.model)) body.temperature = 0;
  return {
    url: OPENAI_URL,
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body,
  };
}

export function buildAnthropicRequest(options: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}): ProviderRequest {
  return {
    url: ANTHROPIC_URL,
    headers: {
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
      // Anthropic rejects browser calls unless the GM's own key opts into them.
      "anthropic-dangerous-direct-browser-access": "true",
      "Content-Type": "application/json",
    },
    body: {
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: 0,
      system: options.system,
      messages: [{ role: "user", content: options.user }],
    },
  };
}

export function buildOllamaRequest(options: {
  baseUrl: string;
  model: string;
  system: string;
  user: string;
}): ProviderRequest {
  const base = (options.baseUrl || OLLAMA_DEFAULT_URL).replace(/\/$/, "");
  return {
    url: `${base}/api/chat`,
    headers: { "Content-Type": "application/json" },
    body: {
      model: options.model,
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
    },
  };
}

export function readProviderText(provider: ProviderId, payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new Error("The provider returned an empty body.");
  const record = payload as Record<string, unknown>;
  if (provider === "openai") {
    const choices = record.choices as { message?: { content?: unknown } }[] | undefined;
    const content = choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("OpenAI returned no message text.");
    return content;
  }
  if (provider === "anthropic") {
    const content = record.content as { text?: unknown }[] | undefined;
    const text = content?.map((part) => (typeof part.text === "string" ? part.text : "")).join("");
    if (!text?.trim()) throw new Error("Anthropic returned no message text.");
    return text;
  }
  const message = record.message as { content?: unknown } | undefined;
  if (typeof message?.content !== "string" || !message.content.trim()) {
    throw new Error("Ollama returned no message text.");
  }
  return message.content;
}

export interface ChatOptions {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;
  system: string;
  user: string;
  maxTokens?: number;
}

/** Browser fetch. Tests use the pure builders instead of calling this. */
export async function completeChat(options: ChatOptions): Promise<string> {
  const maxTokens = options.maxTokens ?? 4096;
  const request = options.provider === "anthropic"
    ? buildAnthropicRequest({ ...options, maxTokens })
    : options.provider === "ollama"
      ? buildOllamaRequest({
        baseUrl: options.baseUrl ?? OLLAMA_DEFAULT_URL,
        model: options.model,
        system: options.system,
        user: options.user,
      })
      : buildOpenAiRequest({ ...options, maxTokens });

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    throw new Error(redact(`Could not reach the provider: ${message}`, options.apiKey));
  }
  const raw = await response.text();
  const safe = redact(raw, options.apiKey);
  if (!response.ok) {
    throw new Error(`The provider returned ${response.status}: ${safe.slice(0, 500)}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`The provider did not return JSON: ${safe.slice(0, 300)}`);
  }
  return readProviderText(options.provider, payload);
}
