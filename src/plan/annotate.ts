import type { MatchMode } from "../mapping/names.ts";
import { readCreatureStats, statDifferences } from "../mapping/srd.ts";
import type { ImportPlan } from "./types.ts";
import { srdPackId } from "./build.ts";

export interface SrdDocument {
  id: string;
  uuid: string;
  name: string;
  system: unknown;
  toObject(): Record<string, unknown>;
}

export type SrdResolver = (packId: string, name: string, mode: MatchMode) => Promise<SrdDocument | null>;

/** Compare each actor's name to the SRD compendium for the plan's ruleset. */
export async function annotateSrd(plan: ImportPlan, resolve: SrdResolver): Promise<void> {
  const packId = srdPackId(plan.ruleset);
  for (const actor of plan.actors) {
    actor.srdNotes = [];
    const doc = await resolve(packId, actor.npc.name, "monster");
    if (!doc) {
      actor.match = "custom";
      actor.source = "custom";
      delete actor.srd;
      actor.srdNotes.push(`No ${packId} entry named “${actor.npc.name}”. It will be built from the stat block.`);
      continue;
    }
    const stats = readCreatureStats(doc.system);
    const diffs = statDifferences(
      { ac: actor.npc.ac, hp: actor.npc.hp, ...(actor.npc.cr == null ? {} : { cr: actor.npc.cr }) },
      stats,
    );
    actor.match = diffs.length ? "srd-changed" : "srd";
    actor.source = "srd";
    actor.srd = { packId, documentId: doc.id, name: doc.name, uuid: doc.uuid };
    actor.srdNotes.push(...diffs);
    if (doc.name !== actor.npc.name) actor.srdNotes.push(`SRD entry is “${doc.name}”.`);
    if (diffs.length === 0) actor.srdNotes.push(`Matches the SRD actor “${doc.name}”.`);
  }
}
