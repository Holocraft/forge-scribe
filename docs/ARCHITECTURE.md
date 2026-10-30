# How Folio is built

This is a walkthrough for someone who has not written a Foundry VTT module before. It names the files that matter and the Foundry ideas they depend on.

## What a module is

Foundry is the virtual tabletop program. A **system** (here, `dnd5e`) defines the rules: actor sheets, items, spells. A **module** is an add-on that runs inside a world. Folio is a module. It does not ship adventures. The GM points it at a PDF they own, and it creates documents in that world.

Foundry loads the module because of `module.json`:

- `id` must match the folder name under `Data/modules`. Ours is `folio`.
- `esmodules` is the JavaScript entry. Foundry runs `dist/folio.js` as an ES module when the world starts.
- `styles` is `dist/folio.css`, loaded for the whole world, which is why the read-aloud box is styled inside journals.
- `compatibility.minimum` is Foundry 14. `relationships.systems` requires the dnd5e system at 6.0.0 or newer.
- There is no `packs` entry. Packs are compendiums of content. We do not ship content.

The `description` field is a placeholder. Foundry's AI policy requires a human to write the package listing. See `docs/LISTING.md`.

## Startup

`src/folio.ts` registers two things on Foundry **hooks**. A hook is a named event. `init` fires while the world is booting, before actors exist. That is when `src/foundry/settings.ts` calls `game.settings.register`.

Settings have a **scope**:

- `client` is stored in this browser only. The API key uses client scope. It is not written into the world database and is not sent to other users. The wizard is the only place that reads it, and `src/llm/providers.ts` puts it in an HTTP header to the provider the GM picked.
- `world` is stored in the world. The ruleset (2014 or 2024) and the import log use world scope so every GM of that world sees the same choice.

`renderJournalDirectory` fires when the Journal sidebar is drawn. We add a Folio button there, and only if `game.user.isGM` is true. Players do not see it. There is also a button under Configure Settings, limited with `restricted: true`.

## The wizard

`src/ui/wizard.ts` is an **ApplicationV2**. That is Foundry's window class as of v13. Older modules used `Application` and Handlebars templates. V2 asks the class for HTML (`_renderHTML`) and then inserts it (`_replaceHTML`). Buttons with `data-action="create"` call the matching function in `DEFAULT_OPTIONS.actions`. Foundry calls that function with the window as `this`.

The window has five steps: pick a file, confirm what was extracted, wait, review, done. The PDF bytes stay in the window object. They are not stored in a setting.

## Reading the PDF

`src/pdf/browser.ts` loads `pdfjs-dist` in the GM's browser. Foundry has its own PDF viewer, but that copy is not a stable API for modules, so we bundle our own and copy `pdf.worker.min.mjs` next to `dist/folio.js`.

pdf.js returns fragments with an x and a y, not paragraphs. `src/pdf/columns.ts` finds the blank gutter between two columns and reads the left column before the right one. A drop cap (a huge "Q" beside "ueen Kalia") is glued back onto the first line. `src/pdf/headings.ts` treats larger type as headings. `src/pdf/statblocks.ts` cuts out a block when a heading is followed by Armor Class, hit points, and the STR DEX CON row.

`src/pdf/extract.ts` is a pure function. The tests in `test/pdf-extract.test.ts` run it in Node against The Hunted Queen. Nothing in that path needs Foundry.

A password-protected PDF is refused. A page with almost no text is reported as a scan. This version does not OCR.

## What the model is allowed to return

The model never builds a Foundry actor. `src/llm/schema.ts` describes a small outline (chapters, sections, read-aloud paragraphs) and a small NPC (name, AC, HP, six scores, actions). Both objects are `.strict()`, so a response that includes `system`, `items`, or `prototypeToken` is rejected. `src/llm/run.ts` retries once with the validation error, then gives up.

`src/llm/providers.ts` knows how to call OpenAI, Anthropic, and a local Ollama server. Each builder returns a URL, headers, and a body. Tests check that the API key is only a header. Anthropic's browser calls need the header `anthropic-dangerous-direct-browser-access: true` because the GM's key is being used from a web page.

A later hosted tier can be another provider with `mode: "hosted"` that posts the same JSON to a server we run. The wizard already skips the API key when `needsApiKey` is false. There is no server in this version.

If the model fails, or the GM turns AI off, `src/plan/build.ts` still makes a plan from the headings and from `src/mapping/stat-parse.ts`, which reads AC, HP, abilities, and attacks with regular expressions. Printed numbers win when they disagree with the model. These stat blocks often have no Challenge rating; CR stays unset (stored as 0 on the actor) and the review screen says so.

## Turning that into dnd5e documents

dnd5e 6 stores a creature as an **Actor** of type `npc`. Attacks are not fields on the actor. Each attack is an **Item** (we use a `feat` item) that contains **activities**. An activity has a `type` of `attack`, `save`, or `utility`. The attack button on the sheet comes from the activity. `src/mapping/activities.ts` builds those objects.

We set `attack.flat` so the roll uses the bonus printed in the book. If we left it blank, dnd5e would add proficiency and an ability modifier again and the to-hit would be wrong.

Armor Class uses `calc: "flat"` so the printed number stays even if we also copy a suit of armor from the SRD.

When the creature's name matches the SRD, we do not rebuild it. `src/plan/annotate.ts` looks in `dnd5e.actors24` for 2024 rules or `dnd5e.monsters` for 2014 rules. `src/mapping/names.ts` matches "Goblins" to "Goblin" and does not match "Goblin" to "Goblin Warrior". On a hit, `src/mapping/srd.ts` copies the compendium actor and sets `_stats.compendiumSource` to that actor's uuid. That field is how Foundry remembers where a copy came from. If AC, HP, or CR differ, we overwrite those three and flag the actor as `srd-changed`. The GM can switch the row to "From the stat block" if they want the PDF's attacks instead.

Gear and spell names are copied from `equipment24` / `items` and `spells24` / `spells` when the name matches. A spell that is not in the SRD is mentioned in a warning. We do not invent spell items. Magic items as their own cards are out of scope.

Journals: one **JournalEntry** per chapter, one **page** per section. Page HTML is built in `src/mapping/journal.ts`. Read-aloud paragraphs sit in `<div class="folio-read-aloud">`. Creature names become `@UUID[Actor.<id>]{Name}` after the actors exist. That is Foundry's link syntax. `text.format: 1` means the page is HTML.

`src/foundry/create.ts` does the creating, but only through an `ImportHost`. The tests pass a fake host. `src/foundry/host.ts` is the real one: `Folder.create`, `Actor.create`, `JournalEntry.create`, and `game.packs`.

Every created document gets `flags.folio.importId`. **Flags** are a bag of module data on a document. `src/foundry/undo.ts` finds documents with that flag and deletes them.

## Adventure export

An **Adventure** is a compendium that holds copies of actors, journals, and folders. The GM can import it again, including into another world. `src/foundry/adventure.ts` creates one in this world when the checkbox is on. Foundry's importer rewrites ids so the UUID links still point at the copies. That rewrite has not been run in CI. See the manual checklist.

## Build and tests

```bash
npm install
npm test
npm run typecheck
npm run build
```

Vite writes `dist/folio.js`, `dist/folio.css`, and copies the pdf.js worker. Tests use Vitest and do not need a Foundry license. The Hunted Queen PDF in `test-pdfs/` is CC BY 4.0; see `test-pdfs/README.md`.

`scripts/dump-blocks.ts` prints the stat blocks extracted from that PDF. It is a debugging aid, not part of the module.

## Where to edit things

| You want to… | Look at |
|---|---|
| Change how columns or headings are detected | `src/pdf/` |
| Change what the model must return | `src/llm/schema.ts` and `src/llm/prompts.ts` |
| Add a provider | `src/llm/providers.ts` |
| Change an attack, save, or AC field on the actor | `src/mapping/activities.ts` and `src/mapping/actor.ts` |
| Change which compendium is searched | `src/constants.ts` `SRD_PACKS` |
| Change the window layout | `src/ui/render.ts` and `src/styles.css` |

dnd5e activity fields move between system versions. If a sheet opens and an attack does not roll, compare `activities.ts` with a weapon in `packs/_source` on the dnd5e GitHub tag you are running, and change the mapper. Do not ask the model to emit the new JSON.
