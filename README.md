# Forge Scribe

Forge Scribe is a Foundry VTT module that turns a D&D 5e adventure PDF into journals and NPC actors. It runs in the GM's browser. You bring your own OpenAI or Anthropic API key (or a local Ollama server). The PDF is not uploaded to us.

**Only import PDFs you own or that are freely licensed.** Forge Scribe does not ship adventure text. Not legal advice.

This is an MVP for Foundry v14 and the dnd5e system 6.0 or newer. Scenes, maps, OCR, and magic-item cards are not in this version. Bindery can pull art out of the same PDF.

Source: <https://github.com/Holocraft/forge-scribe>

## Install from a release

After a version is tagged `v0.1.0` (or later), Foundry can install it from this manifest URL:

`https://github.com/Holocraft/forge-scribe/releases/latest/download/module.json`

In Foundry, open **Setup → Add-on Modules → Install Module**, paste that URL, and install. The module folder is `forge-scribe`, matching the `id` in `module.json`. The release zip is `forge-scribe.zip` and contains that folder. No release is tagged yet, so that URL will 404 until the first tag.

## Install from a local build

You need Node 22.

```bash
npm install
npm test
npm run build
```

Copy these into `Data/modules/forge-scribe` (create the folder):

- `module.json`
- `dist/` (the script, the stylesheet, the source map, and `pdf.worker.min.mjs`)
- `lang/`
- `LICENSE`
- `README.md`

Launch a world that uses the dnd5e system, enable Forge Scribe in **Manage Modules**, and reload. A **Forge Scribe** button appears at the top of the Journal sidebar for the GM.

## Using it

1. Open Forge Scribe. Read the notice. Pick a text PDF and a page range.
2. Choose 2014 or 2024 rules. That selects which SRD compendium names are matched against (`dnd5e.monsters` or `dnd5e.actors24`). The same choice is a world setting.
3. Pick a provider. The API key is stored as a client setting in this browser. It is sent only to that provider.
4. Review the journals and actors. Uncheck, rename, or merge sections. For a creature that exists in the SRD you can copy that actor or build one from the stat block.
5. Create. Read-aloud text is a shaded box. Creature names in the journals link to the actors.
6. **Undo import** deletes the documents from that run. Optionally, also save an Adventure compendium in this world so you can import the same set again.

Turning AI off still imports from headings and from the numbers printed in stat blocks. If the model returns something that is not the small schema Forge Scribe asked for, that response is rejected and the printed numbers are used instead.

Ollama has to allow the browser. If the request is blocked, start Ollama with `OLLAMA_ORIGINS=*`.

## Tests

`npm test` runs Vitest. It does not start Foundry. Covered:

- PDF cleanup, two-column order, drop caps, and stat-block cuts, using The Hunted Queen (CC BY 4.0, see `test-pdfs/README.md`)
- Validation of model JSON, including a retry and a rejection of raw Foundry actor JSON
- Mapping a parsed stat block onto dnd5e actors, activities, and journal HTML
- Creating documents through a fake Foundry host, including `@UUID` links

A real world needs a Foundry license, so end-to-end checks are a checklist: `docs/MANUAL-TEST.md`.

`npm run typecheck` runs the TypeScript compiler. `docs/ARCHITECTURE.md` explains the module for someone new to Foundry.

## Release

Pushing a tag `v0.1.0` on `Holocraft/forge-scribe` runs `.github/workflows/release.yml`. It tests, builds, stamps `module.json` from `github.repository` (`Holocraft/forge-scribe`), and attaches `module.json` and `forge-scribe.zip` to the GitHub release. Foundry's update check uses `https://github.com/Holocraft/forge-scribe/releases/latest/download/module.json`. `download` points at that tag's zip. Do not tag until you want a public release.

## What is not done

- Scenes, maps, and token art
- OCR for scans
- Magic items and roll tables as their own documents
- Spellcasting NPCs beyond copying an SRD spell when the name matches
- A hosted "no API key" service. The provider list is shaped so one can be added later
- The Foundry package listing description. A human has to write that. See `docs/LISTING.md`

## Open questions

- The Foundry license for clicking through `docs/MANUAL-TEST.md` is still required. CI cannot boot Foundry.
- Whether to ask Foundry staff about the AI-policy gray area before a package listing, or to stay on a manifest URL. The listing text is intentionally unwritten.
- Bindery is adding stat-block import. This module does not read maps. Interop (Bindery for art, Forge Scribe for text and actors) is not built.
- Default model ids (`gpt-4.1-mini`, `claude-sonnet-4-5`) are starting points. The wizard lets you replace them.
- Adventure export follows Foundry's Adventure document API, and the id rewrite on import still needs the manual checklist.
- The Hunted Queen stat blocks do not print a Challenge rating. Forge Scribe leaves CR at 0 and says so. Confirm that is what you want on the sheet.
