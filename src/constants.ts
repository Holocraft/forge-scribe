/** Module id. Must match the folder name under Foundry's Data/modules and the id in module.json. */
export const MODULE_ID = "forge-scribe";

/** Shown in Foundry's module list and on the wizard window. The id matches the repo and the install folder. */
export const MODULE_TITLE = "Forge Scribe";

export type Ruleset = "2014" | "2024";

/**
 * Compendium ids in the dnd5e system, confirmed against system 6.0.6.
 * 2024 rules live in the "Modern" packs (SRD 5.2). 2014 rules live in the legacy SRD 5.1 packs.
 * We never copy those compendiums into this repo; we only read them at runtime in the GM's world.
 */
export const SRD_PACKS: Record<Ruleset, { actors: string; items: string; spells: string }> = {
  "2024": {
    actors: "dnd5e.actors24",
    items: "dnd5e.equipment24",
    spells: "dnd5e.spells24",
  },
  "2014": {
    actors: "dnd5e.monsters",
    items: "dnd5e.items",
    spells: "dnd5e.spells",
  },
};

/** Starting model ids. The wizard lets the GM replace these; providers rename models often. */
export const DEFAULT_MODELS = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-sonnet-4-5",
  ollama: "llama3.1",
} as const;

export const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const OLLAMA_DEFAULT_URL = "http://127.0.0.1:11434";

/** Flag namespace on every document this module creates, so Undo can find them later. */
export const FLAG_IMPORT_ID = "importId";
