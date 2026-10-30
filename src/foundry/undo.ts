import { MODULE_ID } from "../constants.ts";
import { escapeHtml } from "../html.ts";
import { forgetImport, readImportLog } from "./settings.ts";

/**
 * Every document Folio creates carries flags.folio.importId.
 * Undo finds those documents and deletes them. Folders go last so their
 * contents are already gone. An adventure compendium recorded in the import
 * log is deleted too.
 */
export async function undoImport(importId: string): Promise<number> {
  const actors = game.actors.filter((doc) => doc.getFlag(MODULE_ID, "importId") === importId);
  const journals = game.journal.filter((doc) => doc.getFlag(MODULE_ID, "importId") === importId);
  const folders = game.folders.filter((doc) => doc.getFlag(MODULE_ID, "importId") === importId);
  if (actors.length) await Actor.deleteDocuments(actors.map((doc) => doc.id));
  if (journals.length) {
    const JournalDocs = JournalEntry as unknown as { deleteDocuments(ids: string[]): Promise<unknown> };
    await JournalDocs.deleteDocuments(journals.map((doc) => doc.id));
  }
  if (folders.length) {
    const FolderDocs = Folder as unknown as { deleteDocuments(ids: string[]): Promise<unknown> };
    await FolderDocs.deleteDocuments(folders.map((doc) => doc.id));
  }
  const record = readImportLog().find((entry) => entry.id === importId);
  if (record?.adventurePack) {
    const pack = game.packs.get(record.adventurePack);
    if (pack) await pack.deleteCompendium();
  }
  await forgetImport(importId);
  return actors.length + journals.length + folders.length;
}

export async function confirmUndo(title: string): Promise<boolean> {
  const content = `<p>Delete the journals, actors, and folders Folio created for <strong>${escapeHtml(title)}</strong>?</p>`;
  if (foundry.applications?.api?.DialogV2?.confirm) {
    return Boolean(await foundry.applications.api.DialogV2.confirm({
      window: { title: "Undo Folio import" },
      content,
      modal: true,
    }));
  }
  if (typeof Dialog !== "undefined" && Dialog.confirm) {
    return Boolean(await Dialog.confirm({ title: "Undo Folio import", content }));
  }
  return true;
}
