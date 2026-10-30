import { matchCompendiumName, type MatchMode } from "../mapping/names.ts";
import type { SrdDocument } from "../plan/annotate.ts";
import type { AdventureExport, CreatedDoc, ImportHost } from "./create.ts";
import { exportAdventure } from "./adventure.ts";

/**
 * The live Foundry calls. createImport is tested against a fake host;
 * this file is the only place that talks to Folder, Actor, and the compendiums.
 */

interface IndexEntry {
  _id?: string;
  id?: string;
  name?: string;
}

async function indexEntries(pack: FolioPack): Promise<{ id: string; name: string }[]> {
  const index = await pack.getIndex();
  const rows: IndexEntry[] = [];
  if (index.contents?.length) rows.push(...index.contents);
  else if (index.forEach) index.forEach((entry) => rows.push(entry));
  return rows
    .filter((entry) => entry.name)
    .map((entry) => ({ id: entry._id ?? entry.id ?? "", name: entry.name ?? "" }))
    .filter((entry) => entry.id && entry.name);
}

function wrap(doc: FolioDocument): CreatedDoc {
  return {
    id: doc.id,
    name: doc.name,
    uuid: doc.uuid,
    toObject: () => doc.toObject(),
    toCompendium: () => (doc.toCompendium ? doc.toCompendium() : doc.toObject()),
  };
}

async function resolveSrd(packId: string, name: string, mode: MatchMode): Promise<SrdDocument | null> {
  const pack = game.packs.get(packId);
  if (!pack) return null;
  const entries = await indexEntries(pack);
  const hit = matchCompendiumName(name, entries.map((entry) => entry.name), mode);
  if (!hit) return null;
  const entry = entries.find((candidate) => candidate.name === hit.name);
  if (!entry) return null;
  const doc = await pack.getDocument(entry.id);
  return {
    id: doc.id,
    uuid: doc.uuid,
    name: doc.name,
    system: doc.system,
    toObject: () => doc.toObject(),
  };
}

export function liveHost(): ImportHost {
  return {
    async createFolder(data) {
      const folder = await Folder.create(data);
      if (!folder) throw new Error("Foundry did not create the folder.");
      return { id: folder.id };
    },
    async createActors(data) {
      const created = [];
      for (const entry of data) {
        const actor = await Actor.create(entry);
        if (!actor) throw new Error("Foundry did not create an actor.");
        created.push(wrap(actor));
      }
      return created;
    },
    async createJournal(data) {
      const journal = await JournalEntry.create(data);
      if (!journal) throw new Error("Foundry did not create the journal.");
      return wrap(journal);
    },
    resolveSrd,
    exportAdventure: (args: AdventureExport) => exportAdventure(args),
  };
}
