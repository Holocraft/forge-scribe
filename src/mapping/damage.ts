/** Dice expressions the activity mapper knows how to store as dnd5e damage parts. */

export interface DamagePartDraft {
  formula: string;
  type: string;
}

export interface DamagePartData {
  number: number;
  denomination: number;
  bonus: string;
  types: string[];
  custom: { enabled: boolean; formula: string };
  scaling: { mode: string; number: number; formula: string };
}

const FORMULA = /^(\d+)d(\d+)([+-]\d+)?$/;
const KNOWN_TYPES = new Set([
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
]);

export function normalizeFormula(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, "").replace(/\u2212/g, "-");
  return FORMULA.test(cleaned) ? cleaned : null;
}

export function normalizeDamageType(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z]/g, "");
}

export function isKnownDamageType(raw: string): boolean {
  return KNOWN_TYPES.has(normalizeDamageType(raw));
}

/** A dnd5e DamageData object. Unknown formulas fall back to the custom field. */
export function damagePartData(part: DamagePartDraft): DamagePartData {
  const formula = normalizeFormula(part.formula);
  const type = normalizeDamageType(part.type);
  const match = formula?.match(FORMULA);
  if (!match) {
    return {
      number: 0,
      denomination: 0,
      bonus: "",
      types: isKnownDamageType(type) ? [type] : [],
      custom: { enabled: true, formula: part.formula.replace(/\s+/g, "") },
      scaling: { mode: "", number: 1, formula: "" },
    };
  }
  const signed = match[3] ?? "";
  return {
    number: Number(match[1]),
    denomination: Number(match[2]),
    bonus: signed.startsWith("+") ? signed.slice(1) : signed,
    types: isKnownDamageType(type) ? [type] : [],
    custom: { enabled: false, formula: "" },
    scaling: { mode: "", number: 1, formula: "" },
  };
}

export function formatBonus(bonus: number): string {
  return bonus >= 0 ? `+${bonus}` : String(bonus);
}
