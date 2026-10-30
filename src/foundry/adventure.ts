import type { AdventureExport } from "./create.ts";

/**
 * An Adventure document is Foundry's way of bundling actors, journals, and
 * folders into one compendium the GM can import again later, including into
 * another world. It lives in this world. Folio never uploads it.
 *
 * Core's importer rewrites document ids when the adventure is imported, which
 * is what keeps `@UUID` links pointed at the copies. That rewrite has not been
 * exercised in CI. The manual test checklist covers one export.
 */
export async function exportAdventure(args: AdventureExport): Promise<string> {
  const name = `folio-${args.importId}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const pack = await foundry.documents.collections.CompendiumCollection.createCompendium({
    name,
    label: args.title,
    type: "Adventure",
  });
  const snapshot = (doc: { toCompendium?: () => Record<string, unknown>; toObject: () => Record<string, unknown> }) => (
    doc.toCompendium ? doc.toCompendium() : doc.toObject()
  );
  await foundry.documents.Adventure.create({
    name: args.title,
    description: `<p>Built by Folio in this world. Import id ${args.importId}. Only the owner of the source PDF should keep this adventure.</p>`,
    actors: args.actors.map(snapshot),
    journal: args.journals.map(snapshot),
    folders: args.folders.map(snapshot),
    items: [],
    scenes: [],
    tables: [],
    macros: [],
    playlists: [],
    cards: [],
    combats: [],
  }, { pack: pack.collection });
  return pack.collection;
}
