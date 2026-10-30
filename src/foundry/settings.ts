import { MODULE_ID, OLLAMA_DEFAULT_URL, type Ruleset } from "../constants.ts";

/**
 * Foundry settings have a scope.
 * "client" is stored in this browser only. The API key uses client scope so it
 * is not written into the world database and is not shared with other users.
 * "world" is stored in the world and is the same for every GM. The ruleset and
 * the import log use world scope.
 *
 * config: false keeps a setting out of the Configure Settings dialog. The key
 * is edited in the wizard instead, so it is not sitting in a plain text field
 * on that screen.
 */

export interface ImportRecord {
  id: string;
  title: string;
  createdAt: string;
  adventurePack?: string;
}

export function registerSettings(): void {
  game.settings.register(MODULE_ID, "apiKey", {
    scope: "client",
    config: false,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, "provider", {
    scope: "client",
    config: false,
    type: String,
    default: "openai",
  });
  game.settings.register(MODULE_ID, "model", {
    scope: "client",
    config: false,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, "ollamaUrl", {
    scope: "client",
    config: false,
    type: String,
    default: OLLAMA_DEFAULT_URL,
  });
  game.settings.register(MODULE_ID, "ruleset", {
    name: "FOLIO.Settings.Ruleset.name",
    hint: "FOLIO.Settings.Ruleset.hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      "2024": "2024 rules (SRD 5.2)",
      "2014": "2014 rules (SRD 5.1)",
    },
    default: "2024",
  });
  game.settings.register(MODULE_ID, "importLog", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });
}

function stringSetting(key: string, fallback = ""): string {
  const value = game.settings.get(MODULE_ID, key);
  return typeof value === "string" ? value : fallback;
}

export function readApiKey(): string {
  return stringSetting("apiKey");
}

export async function writeApiKey(value: string): Promise<void> {
  await game.settings.set(MODULE_ID, "apiKey", value);
}

export function readProvider(): string {
  return stringSetting("provider", "openai");
}

export async function writeProvider(value: string): Promise<void> {
  await game.settings.set(MODULE_ID, "provider", value);
}

export function readModel(): string {
  return stringSetting("model");
}

export async function writeModel(value: string): Promise<void> {
  await game.settings.set(MODULE_ID, "model", value);
}

export function readOllamaUrl(): string {
  return stringSetting("ollamaUrl", OLLAMA_DEFAULT_URL);
}

export async function writeOllamaUrl(value: string): Promise<void> {
  await game.settings.set(MODULE_ID, "ollamaUrl", value);
}

export function readRuleset(): Ruleset {
  return stringSetting("ruleset", "2024") === "2014" ? "2014" : "2024";
}

export async function writeRuleset(value: Ruleset): Promise<void> {
  await game.settings.set(MODULE_ID, "ruleset", value);
}

export function readImportLog(): ImportRecord[] {
  const value = game.settings.get(MODULE_ID, "importLog");
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, ImportRecord>).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function rememberImport(record: ImportRecord): Promise<void> {
  const value = game.settings.get(MODULE_ID, "importLog");
  const log = value && typeof value === "object" ? { ...(value as Record<string, ImportRecord>) } : {};
  log[record.id] = record;
  await game.settings.set(MODULE_ID, "importLog", log);
}

export async function forgetImport(id: string): Promise<void> {
  const value = game.settings.get(MODULE_ID, "importLog");
  const log = value && typeof value === "object" ? { ...(value as Record<string, ImportRecord>) } : {};
  delete log[id];
  await game.settings.set(MODULE_ID, "importLog", log);
}
