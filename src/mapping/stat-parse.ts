import type { AbilityKey, ActionDraft, NpcDraft } from "../llm/schema.ts";
import { normalizeFormula } from "./damage.ts";

/**
 * Read the obvious numbers off a stat block with regular expressions.
 * This is the cross-check for the model, and the fallback when the model fails.
 * It does not try to understand every trait; it does try to get AC, HP,
 * the six abilities, and a usable attack or save.
 */

const ABILITY_WORDS: Record<string, AbilityKey> = {
  strength: "str", str: "str",
  dexterity: "dex", dex: "dex",
  constitution: "con", con: "con",
  intelligence: "int", int: "int",
  wisdom: "wis", wis: "wis",
  charisma: "cha", cha: "cha",
};

const SIZES: Record<string, NonNullable<NpcDraft["size"]>> = {
  tiny: "tiny",
  small: "sm",
  medium: "med",
  large: "lg",
  huge: "huge",
  gargantuan: "grg",
};

export class StatBlockParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatBlockParseError";
  }
}

export interface PrintedStats {
  ac?: number;
  acNote?: string;
  hp?: number;
  hpFormula?: string;
  abilities?: NpcDraft["abilities"];
  cr?: number;
  speed?: NonNullable<NpcDraft["speed"]>;
  size?: NonNullable<NpcDraft["size"]>;
  creatureType?: string;
  alignment?: string;
}

export function parseCr(raw: string): number | undefined {
  const fraction = raw.match(/(\d+)\s*\/\s*(\d+)/);
  if (fraction?.[1] && fraction[2]) return Number(fraction[1]) / Number(fraction[2]);
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function parsePrintedStats(text: string): PrintedStats {
  const stats: PrintedStats = {};
  const ac = text.match(/(?:armor class|\bac\b)\s+(\d+)(?:\s*\(([^)]+)\))?/i);
  if (ac?.[1]) {
    stats.ac = Number(ac[1]);
    if (ac[2]) stats.acNote = ac[2].trim();
  }
  const hp = text.match(/(?:hit points|\bhp\b)\s+(\d+)(?:\s*\(([^)]+)\))?/i);
  if (hp?.[1]) {
    stats.hp = Number(hp[1]);
    const formula = hp[2] ? normalizeFormula(hp[2]) : null;
    if (formula) stats.hpFormula = formula;
  }
  const cr = text.match(/^challenge\s+(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)/im);
  if (cr?.[1]) stats.cr = parseCr(cr[1]);

  for (const line of text.split("\n")) {
    const scores = [...line.matchAll(/(\d+)\s*\(\s*[+-]?\d+\s*\)/g)];
    if (scores.length >= 6 && !stats.abilities) {
      stats.abilities = {
        str: Number(scores[0]?.[1]),
        dex: Number(scores[1]?.[1]),
        con: Number(scores[2]?.[1]),
        int: Number(scores[3]?.[1]),
        wis: Number(scores[4]?.[1]),
        cha: Number(scores[5]?.[1]),
      };
    }
    const kind = line.match(/^(tiny|small|medium|large|huge|gargantuan)\s+([a-z]+)(?:,\s*(.+))?/i);
    if (kind?.[1] && kind[2]) {
      stats.size = SIZES[kind[1].toLowerCase()];
      stats.creatureType = kind[2].toLowerCase();
      if (kind[3]) stats.alignment = kind[3].trim();
    }
    if (/\bspeed\b/i.test(line)) stats.speed = parseSpeed(line);
  }
  return stats;
}

function parseSpeed(line: string): NonNullable<NpcDraft["speed"]> {
  const speed: NonNullable<NpcDraft["speed"]> = {};
  const rest = line.replace(/(climb|fly|swim|burrow)\s+(\d+)\s*ft\.?(?:\s*\/\s*\d+\s*m\.?)?/gi, (_full, mode: string, value: string) => {
    const key = mode.toLowerCase() as "climb" | "fly" | "swim" | "burrow";
    speed[key] = value;
    return " ";
  });
  const walk = rest.match(/(\d+)\s*ft/i);
  if (walk?.[1]) speed.walk = walk[1];
  if (/hover/i.test(line)) speed.hover = true;
  return speed;
}

function parseDamage(region: string): { formula: string; type: string } | null {
  const match = region.match(/\((\d+d\d+\s*[+-]\s*\d+|\d+d\d+)\)\s*([a-z]+)/i);
  if (!match?.[1] || !match[2]) return null;
  const formula = normalizeFormula(match[1]);
  if (!formula) return null;
  return { formula, type: match[2].toLowerCase() };
}

function parseSave(body: string): { dc: number; abilities: AbilityKey[] } | null {
  const match = body.match(/DC\s+(\d+)\s+([A-Za-z]+)(?:\s+or\s+([A-Za-z]+))?/i);
  if (!match?.[1] || !match[2]) return null;
  const abilities = [match[2], match[3]]
    .filter((word): word is string => Boolean(word))
    .map((word) => ABILITY_WORDS[word.toLowerCase()])
    .filter((key): key is AbilityKey => Boolean(key));
  if (abilities.length === 0) return null;
  return { dc: Number(match[1]), abilities };
}

export function parseFeature(line: string, bucket: "traits" | "actions" | "reactions" | "legendary"): ActionDraft | null {
  const match = line.match(/^([A-Z][^.]+)\.\s+([\s\S]+)$/);
  if (!match?.[1] || !match[2]) return null;
  const name = match[1].trim();
  const body = match[2].replace(/\s+/g, " ").trim();
  const save = parseSave(body);
  const toHit = body.match(/\+\s*(\d+)\s*to hit/i);
  const reach = body.match(/reach\s*(\d+)\s*ft/i);
  const range = body.match(/\brange\s*(\d+)\s*ft/i);
  const melee = /melee/i.test(body);
  // "Hit 6 (1d6+3)" is the damage label. "to hit" is not, so require a number after Hit.
  const hitRegion = body.match(/\bHit:?\s+\d[\s\S]*/i)?.[0] ?? "";
  const hitDamage = parseDamage(hitRegion);
  const riderDamage = parseDamage(body.split(/taking|take/i)[1] ?? "");
  let activation: ActionDraft["activation"] = bucket === "traits" ? "special" : bucket === "legendary" ? "legendary" : "action";
  if (bucket === "reactions" || /as a reaction|\(reaction\)/i.test(body)) activation = "reaction";
  if (/bonus action/i.test(body)) activation = "bonus";

  const action: ActionDraft = { name, kind: "utility", text: `${name}. ${body}`, activation };
  if (toHit) {
    action.kind = "attack";
    action.toHit = Number(toHit[1]);
    if (reach?.[1]) action.reachFt = Number(reach[1]);
    else if (melee && range?.[1]) action.reachFt = Number(range[1]);
    else if (range?.[1]) action.rangeFt = Number(range[1]);
    if (/spell attack/i.test(body)) action.text = `${name}. ${body}`;
    if (hitDamage) action.damage = [hitDamage];
    if (save) {
      action.saveDc = save.dc;
      action.saveAbilities = save.abilities;
      action.halfOnSave = /half as much/i.test(body);
      if (riderDamage && riderDamage.formula !== hitDamage?.formula) action.saveDamage = [riderDamage];
    }
    return action;
  }
  if (save) {
    action.kind = "save";
    action.saveDc = save.dc;
    action.saveAbilities = save.abilities;
    action.halfOnSave = /half as much/i.test(body);
    const saveDamage = riderDamage ?? (!hitDamage ? parseDamage(body) : null);
    if (saveDamage) action.damage = [saveDamage];
    return action;
  }
  return action;
}

function sectionOf(line: string): "actions" | "reactions" | "legendary" | "traits" | null {
  if (/^actions$/i.test(line)) return "actions";
  if (/^reactions$/i.test(line)) return "reactions";
  if (/^legendary actions$/i.test(line)) return "legendary";
  if (/^bonus actions$/i.test(line)) return "actions";
  return null;
}

function parseSkills(text: string): Record<string, number> | undefined {
  const line = text.match(/^skills\s+(.+)$/im)?.[1];
  if (!line) return undefined;
  const skills: Record<string, number> = {};
  for (const match of line.matchAll(/([A-Za-z][A-Za-z ]*?)\s*([+-]\d+)/g)) {
    const label = match[1]?.trim().toLowerCase();
    const bonus = match[2];
    if (label && bonus) skills[label] = Number(bonus);
  }
  return Object.keys(skills).length ? skills : undefined;
}

function parseSenses(text: string): NpcDraft["senses"] | undefined {
  const senses: NonNullable<NpcDraft["senses"]> = {};
  const blindsight = text.match(/blindsight\s+(\d+)/i);
  const darkvision = text.match(/darkvision\s+(\d+)/i);
  const tremorsense = text.match(/tremorsense\s+(\d+)/i);
  const truesight = text.match(/truesight\s+(\d+)/i);
  if (blindsight?.[1]) senses.blindsight = Number(blindsight[1]);
  if (darkvision?.[1]) senses.darkvision = Number(darkvision[1]);
  if (tremorsense?.[1]) senses.tremorsense = Number(tremorsense[1]);
  if (truesight?.[1]) senses.truesight = Number(truesight[1]);
  return Object.keys(senses).length ? senses : undefined;
}

function parseLanguages(text: string): string[] | undefined {
  const line = text.match(/^languages\s+(.+)$/im)?.[1]?.trim();
  if (!line || /^[—–-]+$/.test(line) || /^none$/i.test(line)) return [];
  return line.split(/,|and/).map((part) => part.trim()).filter(Boolean);
}

function gearAndSpells(note: string | undefined): { gear?: string[]; spells?: string[] } {
  if (!note) return {};
  const lower = note.toLowerCase();
  if (lower.includes("mage armor") || lower.includes("barkskin")) return { spells: [lower] };
  if (/natural armor|unarmored/.test(lower)) return {};
  if (/leather|chain|plate|scale|hide|shield|mail|breastplate|padded/.test(lower)) return { gear: [lower] };
  return {};
}

export function fallbackNpcFromStatBlock(name: string, text: string): NpcDraft {
  const printed = parsePrintedStats(text);
  if (printed.ac == null || printed.hp == null || !printed.abilities) {
    throw new StatBlockParseError(`Could not read AC, HP, and ability scores for ${name}.`);
  }
  let bucket: "traits" | "actions" | "reactions" | "legendary" = "traits";
  const grouped: Record<"traits" | "actions" | "reactions" | "legendary", ActionDraft[]> = {
    traits: [], actions: [], reactions: [], legendary: [],
  };
  const vulnerabilities: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const section = sectionOf(line);
    if (section) {
      bucket = section;
      continue;
    }
    const feature = parseFeature(line, bucket);
    if (!feature) continue;
    if (/silver deals double/i.test(feature.text ?? "")) vulnerabilities.push("silver");
    const home = feature.activation === "reaction"
      ? "reactions"
      : feature.activation === "bonus"
        ? "actions"
        : bucket;
    if (feature.activation === "bonus") feature.activation = "bonus";
    grouped[home].push(feature);
  }

  const extra = gearAndSpells(printed.acNote);
  const skills = parseSkills(text);
  const senses = parseSenses(text);
  const languages = parseLanguages(text);
  const npc: NpcDraft = {
    name,
    ac: printed.ac,
    hp: printed.hp,
    abilities: printed.abilities,
    ...extra,
  };
  if (skills) npc.skills = skills;
  if (senses) npc.senses = senses;
  if (languages) npc.languages = languages;
  if (printed.hpFormula) npc.hpFormula = printed.hpFormula;
  if (printed.speed && Object.keys(printed.speed).length > 0) npc.speed = printed.speed;
  if (printed.size) npc.size = printed.size;
  if (printed.creatureType) npc.creatureType = printed.creatureType;
  if (printed.alignment) npc.alignment = printed.alignment;
  if (printed.cr != null) npc.cr = printed.cr;
  if (vulnerabilities.length) npc.vulnerabilities = vulnerabilities;
  if (grouped.traits.length) npc.traits = grouped.traits;
  const bonus = grouped.actions.filter((action) => action.activation === "bonus");
  const actions = grouped.actions.filter((action) => action.activation !== "bonus");
  if (actions.length) npc.actions = actions;
  if (bonus.length) npc.bonusActions = bonus;
  if (grouped.reactions.length) npc.reactions = grouped.reactions;
  if (grouped.legendary.length) npc.legendaryActions = grouped.legendary;
  return npc;
}
