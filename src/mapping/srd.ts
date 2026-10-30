import type { NpcDraft } from "../llm/schema.ts";

/**
 * When a PDF monster has the same name as an SRD actor, we copy that actor
 * instead of rebuilding it. `_stats.compendiumSource` is the Foundry field
 * that records where a copy came from. The sheet uses it, and so can a later
 * diff. We still overlay AC, HP, and CR when the PDF disagrees, because a
 * third-party book often changes those and nothing else.
 */

export interface CreatureStats {
  ac?: number;
  hp?: number;
  cr?: number;
}

export function readCreatureStats(system: unknown): CreatureStats {
  const ac = readPath(system, ["attributes", "ac"]);
  const flat = readNumber(ac, "flat") ?? readNumber(ac, "value");
  const hp = readNumber(readPath(system, ["attributes", "hp"]), "max");
  const cr = readNumber(readPath(system, ["details"]), "cr");
  return {
    ...(flat == null ? {} : { ac: flat }),
    ...(hp == null ? {} : { hp }),
    ...(cr == null ? {} : { cr }),
  };
}

export function statDifferences(pdf: { ac: number; hp: number; cr?: number }, srd: CreatureStats): string[] {
  const notes: string[] = [];
  if (srd.ac != null && srd.ac !== pdf.ac) notes.push(`AC is ${pdf.ac} in the PDF and ${srd.ac} in the SRD.`);
  if (srd.hp != null && srd.hp !== pdf.hp) notes.push(`HP is ${pdf.hp} in the PDF and ${srd.hp} in the SRD.`);
  if (pdf.cr != null && srd.cr != null && Math.abs(srd.cr - pdf.cr) > 0.001) {
    notes.push(`CR is ${pdf.cr} in the PDF and ${srd.cr} in the SRD.`);
  }
  return notes;
}

export function actorDataFromSrd(source: { uuid: string; toObject: () => Record<string, unknown> }, options: {
  folderId: string;
  importId: string;
  moduleId: string;
  name: string;
  npc: NpcDraft;
  changed: boolean;
  sourcePages?: number[];
}): Record<string, unknown> {
  const data = source.toObject();
  delete data._id;
  data.name = options.name;
  data.folder = options.folderId;
  const stats = (data._stats && typeof data._stats === "object") ? { ...data._stats as object } : {};
  data._stats = { ...stats, compendiumSource: source.uuid };
  const flags = (data.flags && typeof data.flags === "object") ? { ...data.flags as object } : {};
  data.flags = {
    ...flags,
    [options.moduleId]: {
      importId: options.importId,
      match: options.changed ? "srd-changed" : "srd",
      sourcePages: options.sourcePages ?? [],
    },
  };
  if (!options.changed) return data;
  const system = (data.system && typeof data.system === "object")
    ? data.system as Record<string, unknown>
    : {};
  const attributes = (system.attributes && typeof system.attributes === "object")
    ? { ...system.attributes as object } as Record<string, unknown>
    : {};
  const ac = (attributes.ac && typeof attributes.ac === "object") ? { ...attributes.ac as object } : {};
  const hp = (attributes.hp && typeof attributes.hp === "object") ? { ...attributes.hp as object } : {};
  attributes.ac = { ...ac, flat: options.npc.ac, calc: "flat" };
  attributes.hp = {
    ...hp,
    value: options.npc.hp,
    max: options.npc.hp,
    ...(options.npc.hpFormula ? { formula: options.npc.hpFormula } : {}),
  };
  const details = (system.details && typeof system.details === "object")
    ? { ...system.details as object } as Record<string, unknown>
    : {};
  if (options.npc.cr != null) details.cr = options.npc.cr;
  data.system = { ...system, attributes, details };
  return data;
}

export function itemDataFromSrd(source: { toObject: () => Record<string, unknown> }): Record<string, unknown> {
  const data = source.toObject();
  delete data._id;
  delete data.folder;
  if (data.system && typeof data.system === "object" && "equipped" in (data.system as object)) {
    data.system = { ...(data.system as object), equipped: true };
  }
  return data;
}

function readPath(root: unknown, path: string[]): unknown {
  let current = root;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function readNumber(root: unknown, key: string): number | undefined {
  if (!root || typeof root !== "object") return undefined;
  const value = (root as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}
