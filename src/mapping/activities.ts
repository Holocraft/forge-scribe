import type { ActionDraft } from "../llm/schema.ts";
import { damagePartData, formatBonus } from "./damage.ts";
import { escapeHtml } from "../html.ts";

/**
 * dnd5e 4.0 and later (including 6.x) does not store "this is an attack" on the
 * item itself. Each thing the creature can do is an activity inside an item.
 * An activity's `type` is attack, save, or utility. The sheet's roll buttons
 * come from those activities.
 *
 * We set attack.flat so the roll uses the bonus printed in the book. If we
 * left it blank, dnd5e would add proficiency and an ability modifier on top
 * and the to-hit would be wrong whenever the stat block does not say which
 * ability it used.
 */

export interface ActivityData {
  _id: string;
  type: "attack" | "save" | "utility";
  name: string;
  activation: { type: string; value: number | null; condition: string; override: boolean };
  duration: { units: string; concentration: boolean; override: boolean };
  range: { value: string; units: string; special: string; override: boolean };
  attack?: {
    ability: string;
    bonus: string;
    critical: { threshold: null };
    flat: boolean;
    type: { value: string; classification: string };
  };
  damage?: {
    onSave?: string;
    critical?: { bonus: string };
    includeBase?: boolean;
    parts: ReturnType<typeof damagePartData>[];
  };
  save?: {
    ability: string[];
    dc: { calculation: string; formula: string };
  };
  roll?: { formula: string; name: string; prompt: boolean; visible: boolean };
}

function activationType(action: ActionDraft): string {
  if (action.activation === "special") return "special";
  return action.activation ?? "action";
}

function base(id: string, action: ActionDraft, type: ActivityData["type"]): ActivityData {
  const activation = activationType(action);
  const feet = action.reachFt ?? action.rangeFt;
  return {
    _id: id,
    type,
    name: action.name,
    activation: {
      type: activation,
      value: activation && activation !== "special" ? 1 : null,
      condition: "",
      override: false,
    },
    duration: { units: "inst", concentration: false, override: false },
    range: {
      value: feet ? String(feet) : "",
      units: "ft",
      special: "",
      override: false,
    },
  };
}

export function activitiesForAction(action: ActionDraft, newId: () => string): ActivityData[] {
  if (action.kind === "attack") {
    const melee = action.reachFt != null || (action.rangeFt == null);
    const attack = base(newId(), action, "attack");
    attack.attack = {
      ability: "",
      bonus: action.toHit == null ? "" : formatBonus(action.toHit),
      critical: { threshold: null },
      flat: action.toHit != null,
      type: {
        value: melee ? "melee" : "ranged",
        classification: /spell attack/i.test(action.text ?? "") ? "spell" : "weapon",
      },
    };
    attack.damage = {
      critical: { bonus: "" },
      includeBase: false,
      parts: (action.damage ?? []).map(damagePartData),
    };
    const activities = [attack];
    if (action.saveDc != null) {
      activities.push(saveActivity(action, newId(), action.saveDamage ?? []));
    }
    return activities;
  }
  if (action.kind === "save") return [saveActivity(action, newId(), action.damage ?? [])];
  const utility = base(newId(), action, "utility");
  utility.roll = { formula: "", name: "", prompt: false, visible: false };
  return [utility];
}

function saveActivity(action: ActionDraft, id: string, parts: NonNullable<ActionDraft["damage"]>): ActivityData {
  const save = base(id, action, "save");
  save.save = {
    ability: action.saveAbilities?.length ? action.saveAbilities : ["dex"],
    // An empty calculation plus a formula is a flat DC in dnd5e 6.x.
    dc: { calculation: "", formula: String(action.saveDc ?? 10) },
  };
  save.damage = {
    onSave: action.halfOnSave ? "half" : "none",
    parts: parts.map(damagePartData),
  };
  return save;
}

/** Item description. The [[/attack]] and [[/damage]] tokens are dnd5e enrichers. */
export function actionDescription(action: ActionDraft): string {
  const lines: string[] = [];
  if (action.kind === "attack") {
    const damage = (action.damage ?? [])
      .map((part) => `[[/damage ${part.formula} ${part.type}]]`)
      .join(" plus ");
    lines.push(`<p>[[/attack extended]].${damage ? ` ${damage}.` : ""}</p>`);
  }
  if (action.text) lines.push(`<p>${escapeHtml(action.text)}</p>`);
  return lines.join("\n");
}
