import type { Ruleset } from "../constants.ts";
import { escapeHtml } from "../html.ts";
import type { ActionDraft, NpcDraft } from "../llm/schema.ts";
import { actionDescription, activitiesForAction, type ActivityData } from "./activities.ts";
import { normalizeDamageType } from "./damage.ts";
import { CONDITIONS, CREATURE_TYPES, LANGUAGE_KEYS, SKILL_KEYS, skillFromPrintedBonus } from "./skills.ts";

/**
 * Build the plain data for a custom NPC.
 * Foundry fills in the dozens of empty fields (bonuses, death saves, ownership)
 * when Actor.create receives this. We only set what the stat block told us.
 *
 * AC calc is "flat" so the printed Armor Class stays put even if we also copy
 * a suit of armor from the SRD. "default" would recalculate AC from that armor
 * and could disagree with the book.
 */

export interface ItemDraft {
  name: string;
  type: "feat";
  img: string;
  system: {
    description: { value: string };
    type: { value: string; subtype: string };
    activities: Record<string, ActivityData>;
    source: { custom: string };
  };
}

export interface ActorDraft {
  name: string;
  type: "npc";
  img: string;
  prototypeToken: {
    name: string;
    disposition: number;
    bar1: { attribute: string };
  };
  system: {
    abilities: Record<string, { value: number; proficient?: number }>;
    attributes: {
      ac: { flat: number; calc: "flat" };
      hp: { value: number; max: number; formula: string };
      movement: Record<string, string | boolean>;
      senses: { ranges: Record<string, number> };
      spellcasting?: string;
    };
    details: {
      cr: number;
      alignment: string;
      type: { value: string; subtype: string; custom: string };
      biography: { value: string };
      source: { rules: Ruleset; custom: string };
    };
    traits: {
      size: string;
      languages: { value: string[]; custom: string };
      di: { value: string[]; custom: string };
      dr: { value: string[]; custom: string };
      dv: { value: string[]; custom: string };
      ci: { value: string[]; custom: string };
    };
    skills: Record<string, { value: number; bonuses?: { check: string } }>;
    resources: { legact: { max: number } };
  };
  items: ItemDraft[];
}

const FEAT_ICON = "systems/dnd5e/icons/svg/monster.svg";

function languageSplit(values: string[] | undefined): { value: string[]; custom: string } {
  const value: string[] = [];
  const custom: string[] = [];
  for (const entry of values ?? []) {
    const key = LANGUAGE_KEYS[entry.toLowerCase()];
    if (key) value.push(key);
    else if (entry.trim() && !/^[—–-]+$/.test(entry.trim())) custom.push(entry.trim());
  }
  return { value, custom: custom.join(", ") };
}

function featureItem(action: ActionDraft, newId: () => string): ItemDraft {
  const activities = activitiesForAction(action, newId);
  return {
    name: action.name,
    type: "feat",
    img: FEAT_ICON,
    system: {
      description: { value: actionDescription(action) },
      type: { value: "monster", subtype: "" },
      activities: Object.fromEntries(activities.map((activity) => [activity._id, activity])),
      source: { custom: "Folio import" },
    },
  };
}

function allFeatures(npc: NpcDraft): ActionDraft[] {
  return [
    ...(npc.traits ?? []),
    ...(npc.actions ?? []),
    ...(npc.bonusActions ?? []),
    ...(npc.reactions ?? []),
    ...(npc.legendaryActions ?? []),
  ];
}

export function npcToActorData(npc: NpcDraft, options: {
  ruleset: Ruleset;
  newId: () => string;
  notes?: string[];
}): ActorDraft {
  const size = npc.size ?? "med";
  const creature = (npc.creatureType ?? "").toLowerCase();
  const knownType = CREATURE_TYPES.has(creature);
  const damageKnown = new Set([
    "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
    "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
  ]);
  const di = splitList(npc.immunities, damageKnown);
  const dr = splitList(npc.resistances, damageKnown);
  const dv = splitList(npc.vulnerabilities, damageKnown);
  const ci = splitList(npc.conditionImmunities, CONDITIONS);
  const languages = languageSplit(npc.languages);
  const cr = npc.cr ?? 0;
  const skills: ActorDraft["system"]["skills"] = {};
  for (const [label, printed] of Object.entries(npc.skills ?? {})) {
    const skill = SKILL_KEYS[label.toLowerCase()];
    if (!skill) continue;
    skills[skill.id] = skillFromPrintedBonus(printed, npc.abilities[skill.ability], npc.cr ?? null);
  }
  const movement: Record<string, string | boolean> = {};
  if (npc.speed?.walk) movement.walk = npc.speed.walk;
  if (npc.speed?.fly) movement.fly = npc.speed.fly;
  if (npc.speed?.swim) movement.swim = npc.speed.swim;
  if (npc.speed?.climb) movement.climb = npc.speed.climb;
  if (npc.speed?.burrow) movement.burrow = npc.speed.burrow;
  if (npc.speed?.hover) movement.hover = true;
  if (!movement.walk) movement.walk = "30";

  const ranges: Record<string, number> = {};
  if (npc.senses?.darkvision) ranges.darkvision = npc.senses.darkvision;
  if (npc.senses?.blindsight) ranges.blindsight = npc.senses.blindsight;
  if (npc.senses?.tremorsense) ranges.tremorsense = npc.senses.tremorsense;
  if (npc.senses?.truesight) ranges.truesight = npc.senses.truesight;

  const notes = (options.notes ?? []).filter(Boolean);
  const biography = [
    npc.biography ? `<p>${escapeHtml(npc.biography)}</p>` : "",
    notes.length
      ? `<aside class="folio-import-notes"><p><strong>Folio.</strong> ${escapeHtml(notes.join(" "))}</p></aside>`
      : "",
  ].join("");

  const abilities: ActorDraft["system"]["abilities"] = {
    str: { value: npc.abilities.str },
    dex: { value: npc.abilities.dex },
    con: { value: npc.abilities.con },
    int: { value: npc.abilities.int },
    wis: { value: npc.abilities.wis },
    cha: { value: npc.abilities.cha },
  };
  for (const save of npc.saves ?? []) abilities[save] = { value: npc.abilities[save], proficient: 1 };

  const legendary = npc.legendaryActionCount ?? (npc.legendaryActions?.length ? 3 : 0);
  const spellcasting = npc.spellcastingAbility ?? (npc.spells?.length ? "int" : undefined);

  return {
    name: npc.name,
    type: "npc",
    img: FEAT_ICON,
    prototypeToken: {
      name: npc.name,
      // Foundry dispositions: -1 hostile, 0 neutral, 1 friendly.
      disposition: -1,
      bar1: { attribute: "attributes.hp" },
    },
    system: {
      abilities,
      attributes: {
        ac: { flat: npc.ac, calc: "flat" },
        hp: { value: npc.hp, max: npc.hp, formula: npc.hpFormula ?? "" },
        movement,
        senses: { ranges },
        ...(spellcasting ? { spellcasting } : {}),
      },
      details: {
        cr,
        alignment: npc.alignment ?? "",
        type: {
          value: knownType ? creature : "humanoid",
          subtype: npc.subtype ?? "",
          custom: knownType ? "" : (npc.creatureType ?? ""),
        },
        biography: { value: biography },
        source: { rules: options.ruleset, custom: "Folio import" },
      },
      traits: {
        size,
        languages,
        di,
        dr,
        dv,
        ci,
      },
      skills,
      resources: { legact: { max: legendary } },
    },
    items: allFeatures(npc).map((action) => featureItem(action, options.newId)),
  };
}

function splitList(values: string[] | undefined, known: Set<string>): { value: string[]; custom: string } {
  const value: string[] = [];
  const custom: string[] = [];
  for (const entry of values ?? []) {
    const key = normalizeDamageType(entry);
    if (known.has(key)) value.push(key);
    else if (entry.trim()) custom.push(entry.trim());
  }
  return { value, custom: custom.join(", ") };
}
