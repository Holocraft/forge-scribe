import type { AbilityKey } from "../llm/schema.ts";

/** dnd5e skill ids and the ability each one uses. */
export const SKILL_KEYS: Record<string, { id: string; ability: AbilityKey }> = {
  acrobatics: { id: "acr", ability: "dex" },
  "animal handling": { id: "ani", ability: "wis" },
  arcana: { id: "arc", ability: "int" },
  athletics: { id: "ath", ability: "str" },
  deception: { id: "dec", ability: "cha" },
  history: { id: "his", ability: "int" },
  insight: { id: "ins", ability: "wis" },
  intimidation: { id: "itm", ability: "cha" },
  investigation: { id: "inv", ability: "int" },
  medicine: { id: "med", ability: "wis" },
  nature: { id: "nat", ability: "int" },
  perception: { id: "prc", ability: "wis" },
  performance: { id: "prf", ability: "cha" },
  persuasion: { id: "per", ability: "cha" },
  religion: { id: "rel", ability: "int" },
  "sleight of hand": { id: "slt", ability: "dex" },
  stealth: { id: "ste", ability: "dex" },
  survival: { id: "sur", ability: "wis" },
};

export const LANGUAGE_KEYS: Record<string, string> = {
  common: "common",
  dwarvish: "dwarvish",
  elvish: "elvish",
  giant: "giant",
  gnomish: "gnomish",
  goblin: "goblin",
  halfling: "halfling",
  orc: "orc",
  abyssal: "abyssal",
  celestial: "celestial",
  draconic: "draconic",
  "deep speech": "deep",
  infernal: "infernal",
  primordial: "primordial",
  sylvan: "sylvan",
  undercommon: "undercommon",
  druidic: "druidic",
  thievescant: "thievescant",
  "thieves cant": "thievescant",
};

export const CREATURE_TYPES = new Set([
  "aberration", "beast", "celestial", "construct", "dragon", "elemental",
  "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead",
]);

export const CONDITIONS = new Set([
  "blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled",
  "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone",
  "restrained", "stunned", "unconscious",
]);

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Proficiency bonus by challenge rating, the same steps the 5e rules use. */
export function proficiencyBonus(cr: number): number {
  if (cr >= 29) return 9;
  if (cr >= 25) return 8;
  if (cr >= 21) return 7;
  if (cr >= 17) return 6;
  if (cr >= 13) return 5;
  if (cr >= 9) return 4;
  if (cr >= 5) return 3;
  return 2;
}

export interface SkillEntry {
  value: number;
  bonuses?: { check: string };
}

/**
 * dnd5e stores a proficiency multiplier (1 proficient, 2 expertise), not the
 * printed bonus. We pick the multiplier that lands closest, then put any
 * remainder in bonuses.check so the sheet still shows the printed total.
 */
export function skillFromPrintedBonus(printed: number, abilityScore: number, cr: number | null): SkillEntry {
  const modifier = abilityModifier(abilityScore);
  const bonus = proficiencyBonus(cr ?? 0);
  const proficient = modifier + bonus;
  const expertise = modifier + bonus * 2;
  const value = Math.abs(printed - expertise) < Math.abs(printed - proficient) ? 2 : 1;
  const expected = modifier + bonus * value;
  const remainder = printed - expected;
  if (remainder === 0) return { value };
  return { value, bonuses: { check: String(remainder) } };
}
