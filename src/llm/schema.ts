import { z } from "zod";

/**
 * The only JSON the model is allowed to return.
 * Foundry document fields (system, items, flags, prototypeToken) are rejected
 * by `.strict()`, so a model that emits raw actor JSON fails validation and is retried.
 */

const abilityKey = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

const damagePart = z.object({
  formula: z.string().regex(/^\d+d\d+([+-]\d+)?$/),
  type: z.string().min(1).max(40),
}).strict();

export const actionSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["attack", "save", "utility"]),
  text: z.string().max(4000).optional(),
  activation: z.enum(["action", "bonus", "reaction", "legendary", "special"]).optional(),
  toHit: z.number().int().min(-5).max(30).optional(),
  reachFt: z.number().positive().max(1000).optional(),
  rangeFt: z.number().positive().max(1000).optional(),
  damage: z.array(damagePart).max(6).optional(),
  saveDc: z.number().int().min(1).max(40).optional(),
  saveAbilities: z.array(abilityKey).max(3).optional(),
  saveDamage: z.array(damagePart).max(4).optional(),
  halfOnSave: z.boolean().optional(),
}).strict();

export const npcSchema = z.object({
  name: z.string().min(1).max(120),
  size: z.enum(["tiny", "sm", "med", "lg", "huge", "grg"]).optional(),
  creatureType: z.string().max(40).optional(),
  subtype: z.string().max(80).optional(),
  alignment: z.string().max(80).optional(),
  ac: z.number().int().min(1).max(40),
  hp: z.number().int().min(1).max(2000),
  hpFormula: z.string().regex(/^\d+d\d+([+-]\d+)?$/).optional(),
  speed: z.object({
    walk: z.string().regex(/^\d+$/).optional(),
    fly: z.string().regex(/^\d+$/).optional(),
    swim: z.string().regex(/^\d+$/).optional(),
    climb: z.string().regex(/^\d+$/).optional(),
    burrow: z.string().regex(/^\d+$/).optional(),
    hover: z.boolean().optional(),
  }).strict().optional(),
  abilities: z.object({
    str: z.number().int().min(1).max(30),
    dex: z.number().int().min(1).max(30),
    con: z.number().int().min(1).max(30),
    int: z.number().int().min(1).max(30),
    wis: z.number().int().min(1).max(30),
    cha: z.number().int().min(1).max(30),
  }).strict(),
  saves: z.array(abilityKey).max(6).optional(),
  /** Printed bonus, not a Foundry proficiency multiplier. "Stealth +5" is { stealth: 5 }. */
  skills: z.record(z.string(), z.number()).optional(),
  senses: z.object({
    darkvision: z.number().int().nonnegative().optional(),
    blindsight: z.number().int().nonnegative().optional(),
    tremorsense: z.number().int().nonnegative().optional(),
    truesight: z.number().int().nonnegative().optional(),
  }).strict().optional(),
  languages: z.array(z.string().max(40)).max(20).optional(),
  cr: z.number().min(0).max(30).optional(),
  vulnerabilities: z.array(z.string().max(40)).max(12).optional(),
  resistances: z.array(z.string().max(40)).max(12).optional(),
  immunities: z.array(z.string().max(40)).max(12).optional(),
  conditionImmunities: z.array(z.string().max(40)).max(12).optional(),
  traits: z.array(actionSchema).max(20).optional(),
  actions: z.array(actionSchema).max(20).optional(),
  bonusActions: z.array(actionSchema).max(10).optional(),
  reactions: z.array(actionSchema).max(10).optional(),
  legendaryActions: z.array(actionSchema).max(10).optional(),
  legendaryActionCount: z.number().int().min(0).max(10).optional(),
  gear: z.array(z.string().max(80)).max(12).optional(),
  spells: z.array(z.string().max(80)).max(40).optional(),
  spellcastingAbility: abilityKey.optional(),
  biography: z.string().max(4000).optional(),
}).strict();

export const outlineSchema = z.object({
  title: z.string().min(1).max(200),
  chapters: z.array(z.object({
    title: z.string().min(1).max(200),
    sections: z.array(z.object({
      title: z.string().min(1).max(200),
      sourcePages: z.array(z.number().int().positive()).max(40).optional(),
      paragraphs: z.array(z.object({
        readAloud: z.boolean(),
        text: z.string().min(1).max(8000),
      }).strict()).max(80),
      statBlockId: z.string().max(80).optional(),
    }).strict()).min(1).max(40),
  }).strict()).min(1).max(40),
}).strict();

export type ActionDraft = z.infer<typeof actionSchema>;
export type NpcDraft = z.infer<typeof npcSchema>;
export type OutlineDraft = z.infer<typeof outlineSchema>;
export type AbilityKey = z.infer<typeof abilityKey>;

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}
