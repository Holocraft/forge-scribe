import { MODULE_ID } from "../constants.ts";
import { SRD_PACKS } from "../constants.ts";
import { makeId } from "../ids.ts";
import { applyActorLinks, renderSectionHtml } from "../mapping/journal.ts";
import { npcToActorData } from "../mapping/actor.ts";
import { actorDataFromSrd, itemDataFromSrd, readCreatureStats, statDifferences } from "../mapping/srd.ts";
import type { SrdDocument } from "../plan/annotate.ts";
import type { ImportPlan, PlanActor } from "../plan/types.ts";

/**
 * Create the world documents for a plan the GM has already reviewed.
 * Journals are created after actors so `@UUID` links can use the new actor ids.
 *
 * `text.format: 1` is Foundry's HTML journal format
 * (CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML). Markdown is 2.
 */

export interface CreatedDoc {
  id: string;
  name: string;
  uuid: string;
  toObject: () => Record<string, unknown>;
  toCompendium?: () => Record<string, unknown>;
}

export interface ImportHost {
  createFolder(data: Record<string, unknown>): Promise<{ id: string }>;
  createActors(data: Record<string, unknown>[]): Promise<CreatedDoc[]>;
  createJournal(data: Record<string, unknown>): Promise<CreatedDoc>;
  resolveSrd(packId: string, name: string, mode: "monster" | "gear" | "spell"): Promise<SrdDocument | null>;
  exportAdventure?: (args: AdventureExport) => Promise<string>;
}

export interface AdventureExport {
  title: string;
  importId: string;
  folders: CreatedDoc[];
  journals: CreatedDoc[];
  actors: CreatedDoc[];
}

export interface ImportResult {
  importId: string;
  title: string;
  folderIds: string[];
  actorIds: string[];
  journalIds: string[];
  adventurePack?: string;
  warnings: string[];
}

const HTML_FORMAT = 1;

export async function createImport(plan: ImportPlan, host: ImportHost, options?: {
  exportAdventure?: boolean;
  newId?: () => string;
}): Promise<ImportResult> {
  const newId = options?.newId ?? makeId;
  const importId = newId();
  const warnings = [...plan.warnings];
  const includedActors = plan.actors.filter((actor) => actor.include);
  const includedChapters = plan.chapters
    .filter((chapter) => chapter.include)
    .map((chapter) => ({ ...chapter, sections: chapter.sections.filter((section) => section.include) }))
    .filter((chapter) => chapter.sections.length > 0);

  if (includedActors.length === 0 && includedChapters.length === 0) {
    return { importId, title: plan.title, folderIds: [], actorIds: [], journalIds: [], warnings: ["Nothing was checked, so nothing was created."] };
  }

  const flag = { importId };
  const journalFolder = await host.createFolder({
    name: plan.title,
    type: "JournalEntry",
    flags: { [MODULE_ID]: flag },
  });
  const actorFolder = includedActors.length
    ? await host.createFolder({ name: plan.title, type: "Actor", flags: { [MODULE_ID]: flag } })
    : null;

  const createdActors: CreatedDoc[] = [];
  const links: { planId: string; actorId: string; name: string }[] = [];
  for (const actor of includedActors) {
    const data = await actorCreateData(actor, {
      plan,
      host,
      importId,
      folderId: actorFolder?.id ?? "",
      newId,
      warnings,
    });
    const [created] = await host.createActors([data]);
    if (!created) continue;
    createdActors.push(created);
    links.push({ planId: actor.id, actorId: created.id, name: actor.npc.name });
  }

  const journals: CreatedDoc[] = [];
  for (const chapter of includedChapters) {
    const pages = chapter.sections.map((section, index) => {
      const html = applyActorLinks(renderSectionHtml(section, links.map((link) => ({
        id: link.planId,
        name: link.name,
      }))), links);
      return {
        name: section.title,
        type: "text",
        sort: (index + 1) * 1000,
        text: { content: html, format: HTML_FORMAT },
        flags: { [MODULE_ID]: { importId, sourcePages: section.sourcePages } },
      };
    });
    journals.push(await host.createJournal({
      name: chapter.title,
      folder: journalFolder.id,
      pages,
      flags: { [MODULE_ID]: { ...flag, sourcePages: chapter.sections.flatMap((section) => section.sourcePages) } },
    }));
  }

  const folders: { id: string }[] = [journalFolder];
  if (actorFolder) folders.push(actorFolder);
  let adventurePack: string | undefined;
  if (options?.exportAdventure && host.exportAdventure) {
    try {
      const folderDocs: CreatedDoc[] = folders.map((folder) => ({
        id: folder.id,
        name: plan.title,
        uuid: `Folder.${folder.id}`,
        toObject: () => ({ _id: folder.id, name: plan.title, flags: { [MODULE_ID]: flag } }),
      }));
      adventurePack = await host.exportAdventure({
        title: plan.title,
        importId,
        folders: folderDocs,
        journals,
        actors: createdActors,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Adventure export failed.";
      warnings.push(`Journals and actors were created. The adventure compendium was not: ${message}`);
    }
  }

  return {
    importId,
    title: plan.title,
    folderIds: folders.map((folder) => folder.id),
    actorIds: createdActors.map((actor) => actor.id),
    journalIds: journals.map((journal) => journal.id),
    ...(adventurePack ? { adventurePack } : {}),
    warnings,
  };
}

async function actorCreateData(actor: PlanActor, context: {
  plan: ImportPlan;
  host: ImportHost;
  importId: string;
  folderId: string;
  newId: () => string;
  warnings: string[];
}): Promise<Record<string, unknown>> {
  const useSrd = actor.source === "srd" && actor.srd;
  if (useSrd && actor.srd) {
    const doc = await context.host.resolveSrd(actor.srd.packId, actor.srd.name, "monster");
    if (doc) {
      const diffs = statDifferences(
        { ac: actor.npc.ac, hp: actor.npc.hp, ...(actor.npc.cr == null ? {} : { cr: actor.npc.cr }) },
        readCreatureStats(doc.system),
      );
      return actorDataFromSrd(doc, {
        folderId: context.folderId,
        importId: context.importId,
        moduleId: MODULE_ID,
        name: actor.npc.name,
        npc: actor.npc,
        changed: diffs.length > 0,
        sourcePages: actor.sourcePage ? [actor.sourcePage] : [],
      });
    }
    context.warnings.push(`${actor.npc.name} was marked as an SRD match, but the compendium entry could not be loaded. Built from the stat block instead.`);
  }

  const draft = npcToActorData(actor.npc, {
    ruleset: context.plan.ruleset,
    newId: context.newId,
    notes: [...actor.notes, ...actor.srdNotes],
  });
  const packs = SRD_PACKS[context.plan.ruleset];
  const extra: Record<string, unknown>[] = [];
  for (const name of actor.npc.gear ?? []) {
    const item = await context.host.resolveSrd(packs.items, name, "gear");
    if (item) extra.push(itemDataFromSrd(item));
    else context.warnings.push(`No SRD gear named “${name}” for ${actor.npc.name}.`);
  }
  for (const name of actor.npc.spells ?? []) {
    const spell = await context.host.resolveSrd(packs.spells, name, "spell");
    if (spell) extra.push(itemDataFromSrd(spell));
    else context.warnings.push(`No SRD spell named “${name}” for ${actor.npc.name}.`);
  }
  const copied = new Set(extra.map((item) => String(item.name ?? "").toLowerCase()));
  const items = [
    ...extra,
    ...draft.items.filter((item) => !copied.has(item.name.toLowerCase())),
  ];
  return {
    ...draft,
    folder: context.folderId,
    flags: {
      [MODULE_ID]: {
        importId: context.importId,
        match: "custom",
        sourcePages: actor.sourcePage ? [actor.sourcePage] : [],
      },
    },
    items,
  };
}
