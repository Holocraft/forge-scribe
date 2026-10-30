import type { NpcDraft } from "../llm/schema.ts";
import { parsePrintedStats } from "./stat-parse.ts";

/**
 * The printed numbers win. A regex on "Armor Class 13" is more reliable than
 * the model for those fields, and models like to invent a challenge rating
 * when the block does not have one.
 */
export function reconcileNpc(draft: NpcDraft, blockText: string): { npc: NpcDraft; notes: string[] } {
  const printed = parsePrintedStats(blockText);
  const npc: NpcDraft = { ...draft, abilities: { ...draft.abilities } };
  const notes: string[] = [];

  if (printed.ac != null && printed.ac !== npc.ac) {
    notes.push(`AC: using ${printed.ac} from the PDF (the model said ${npc.ac}).`);
    npc.ac = printed.ac;
  }
  if (printed.hp != null && printed.hp !== npc.hp) {
    notes.push(`HP: using ${printed.hp} from the PDF (the model said ${npc.hp}).`);
    npc.hp = printed.hp;
  }
  if (printed.hpFormula && printed.hpFormula !== npc.hpFormula) npc.hpFormula = printed.hpFormula;
  if (printed.abilities) {
    for (const key of ["str", "dex", "con", "int", "wis", "cha"] as const) {
      if (printed.abilities[key] !== npc.abilities[key]) {
        notes.push(`${key.toUpperCase()}: using ${printed.abilities[key]} from the PDF (the model said ${npc.abilities[key]}).`);
        npc.abilities[key] = printed.abilities[key];
      }
    }
  }
  if (printed.cr == null) {
    if (npc.cr != null) notes.push("The model suggested a CR, but the stat block has no Challenge line. CR was left unset.");
    delete npc.cr;
  } else if (npc.cr !== printed.cr) {
    notes.push(`CR: using ${printed.cr} from the PDF (the model said ${npc.cr ?? "nothing"}).`);
    npc.cr = printed.cr;
  }
  if (!npc.size && printed.size) npc.size = printed.size;
  if (!npc.creatureType && printed.creatureType) npc.creatureType = printed.creatureType;
  if (!npc.alignment && printed.alignment) npc.alignment = printed.alignment;
  if (!npc.speed && printed.speed) npc.speed = printed.speed;
  if (npc.cr == null) notes.push("No Challenge rating was printed. CR is 0 until you set it.");
  if (!npc.size || !npc.creatureType) {
    notes.push("Size or creature type was not printed. Assumed Medium humanoid where it was missing.");
  }
  return { npc, notes };
}
