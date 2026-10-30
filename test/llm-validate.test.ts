import { describe, expect, it } from "vitest";
import { extractJson } from "../src/llm/json.ts";
import { NPC_SYSTEM_PROMPT, STRUCTURE_SYSTEM_PROMPT } from "../src/llm/prompts.ts";
import {
  buildAnthropicRequest,
  buildOpenAiRequest,
  readProviderText,
  redact,
} from "../src/llm/providers.ts";
import { splitProse } from "../src/llm/prose.ts";
import { completeValidated, type LlmClient } from "../src/llm/run.ts";
import { npcSchema, outlineSchema } from "../src/llm/schema.ts";

const spider = {
  name: "Giant Blade Spider",
  size: "med",
  creatureType: "beast",
  alignment: "unaligned",
  ac: 13,
  hp: 20,
  hpFormula: "4d8+2",
  speed: { walk: "40", climb: "40" },
  abilities: { str: 12, dex: 16, con: 13, int: 3, wis: 12, cha: 4 },
  actions: [{
    name: "Stab",
    kind: "attack",
    text: "Melee Weapon Attack: +5 to hit.",
    toHit: 5,
    reachFt: 5,
    damage: [{ formula: "1d6+3", type: "piercing" }],
  }],
};

describe("LLM output validation", () => {
  it("accepts the simplified NPC schema and rejects a Foundry actor", () => {
    expect(npcSchema.safeParse(spider).success).toBe(true);
    const foundryShaped = {
      name: "Giant Blade Spider",
      type: "npc",
      system: { abilities: {} },
      items: [],
    };
    const rejected = npcSchema.safeParse(foundryShaped);
    expect(rejected.success).toBe(false);
  });

  it("rejects an outline that smuggles document fields", () => {
    expect(outlineSchema.safeParse({
      title: "The Hunted Queen",
      chapters: [{
        title: "Scene 1",
        sections: [{
          title: "Ambush",
          sourcePages: [1],
          paragraphs: [{ readAloud: false, text: "The carriage stops." }],
        }],
      }],
    }).success).toBe(true);

    expect(outlineSchema.safeParse({
      title: "The Hunted Queen",
      prototypeToken: {},
      chapters: [],
    }).success).toBe(false);
  });

  it("unwraps a fenced JSON object and retries once", async () => {
    const calls: string[] = [];
    const client: LlmClient = {
      async complete(_system, user) {
        calls.push(user);
        if (calls.length === 1) return "```json\n{\"type\":\"npc\",\"system\":{}}\n```";
        return JSON.stringify({ npc: spider });
      },
    };
    const result = await completeValidated(client, npcSchema, NPC_SYSTEM_PROMPT, "stat block");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe("Giant Blade Spider");
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("failed validation");
  });

  it("gives up after a second invalid response", async () => {
    const client: LlmClient = { async complete() { return "not json"; } };
    const result = await completeValidated(client, outlineSchema, STRUCTURE_SYSTEM_PROMPT, "text");
    expect(result.ok).toBe(false);
  });

  it("reads JSON that is wrapped in prose", () => {
    expect(extractJson("Sure!\n```json\n{\"ac\":13}\n```")).toEqual({ ac: 13 });
  });
});

describe("provider requests", () => {
  it("sends the OpenAI key only as a header", () => {
    const request = buildOpenAiRequest({
      apiKey: "sk-test-secret",
      model: "gpt-4.1-mini",
      system: "sys",
      user: "The queen rides",
      maxTokens: 100,
    });
    expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer sk-test-secret");
    expect(request.url).not.toContain("sk-test-secret");
    expect(JSON.stringify(request.body)).not.toContain("sk-test-secret");
    expect(readProviderText("openai", { choices: [{ message: { content: "{\"ac\":13}" } }] })).toBe("{\"ac\":13}");
  });

  it("opts Anthropic into browser access and redacts the key from errors", () => {
    const request = buildAnthropicRequest({
      apiKey: "sk-ant-secret",
      model: "claude-sonnet-4-5",
      system: "sys",
      user: "hello",
      maxTokens: 100,
    });
    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(request.headers["x-api-key"]).toBe("sk-ant-secret");
    expect(JSON.stringify(request.body)).not.toContain("sk-ant-secret");
    expect(redact("bad key sk-ant-secret in body", "sk-ant-secret")).toBe("bad key [redacted] in body");
    expect(readProviderText("anthropic", { content: [{ type: "text", text: "{\"ok\":true}" }] })).toBe("{\"ok\":true}");
  });

  it("splits long prose on headings", () => {
    const heading = (n: number) => `\n# Scene ${n}\n${"word ".repeat(800)}`;
    const chunks = splitProse(Array.from({ length: 12 }, (_, index) => heading(index)).join(""), 5000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 5000)).toBe(true);
    expect(chunks.join("\n")).toContain("# Scene 0");
    expect(chunks.join("\n")).toContain("# Scene 11");
  });
});
