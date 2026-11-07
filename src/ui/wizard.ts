import { MODULE_TITLE, SRD_PACKS } from "../constants.ts";
import { countPdfPages, PdfRejected, readPdfPages } from "../pdf/browser.ts";
import { extractDocument } from "../pdf/extract.ts";
import { completeChat, providerById, type ProviderId } from "../llm/providers.ts";
import { formatProse, splitProse } from "../llm/prose.ts";
import type { LlmClient } from "../llm/run.ts";
import { annotateSrd } from "../plan/annotate.ts";
import { buildImportPlan } from "../plan/build.ts";
import {
  mergeSectionUp,
  renameActor,
  renameSection,
  setActorIncluded,
  setActorNumbers,
  setActorSource,
  setSectionIncluded,
} from "../plan/edit.ts";
import { fallbackNpcFromStatBlock } from "../mapping/stat-parse.ts";
import { reconcileNpc } from "../mapping/reconcile.ts";
import { createImport } from "../foundry/create.ts";
import { liveHost } from "../foundry/host.ts";
import {
  readApiKey,
  readImportLog,
  readModel,
  readOllamaUrl,
  readProvider,
  readRuleset,
  rememberImport,
  writeApiKey,
  writeModel,
  writeOllamaUrl,
  writeProvider,
  writeRuleset,
} from "../foundry/settings.ts";
import { confirmUndo, undoImport } from "../foundry/undo.ts";
import { versionAtLeast } from "../version.ts";
import { renderWizard } from "./render.ts";
import { emptyState, type WizardState } from "./state.ts";

/**
 * ApplicationV2 is Foundry's window class (v13+). The wizard is one window
 * that swaps its contents as the GM moves from picking a file to reviewing
 * the plan. `_renderHTML` returns the `.folio-wizard` element, which is the
 * only child of `.window-content`. Foundry calls the functions in `actions`
 * when a button with `data-action` is clicked, with `this` set to the window.
 *
 * `window.resizable` draws the corner grip. The height is a real pixel size
 * so that grip can shrink the window; the stylesheet then scrolls the step
 * instead of letting the list cover the grip.
 */
export class ImportWizard extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "folio-wizard",
    classes: ["folio-window"],
    tag: "form",
    window: {
      title: MODULE_TITLE,
      icon: "fas fa-book-open",
      resizable: true,
    },
    position: { width: 820, height: 720 },
    form: {
      handler: ImportWizard.#onSubmit,
      closeOnSubmit: false,
      submitOnChange: false,
    },
    actions: {
      "read-pdf": ImportWizard.#onRead,
      structure: ImportWizard.#onStructure,
      create: ImportWizard.#onCreate,
      back: ImportWizard.#onBack,
      undo: ImportWizard.#onUndo,
      "undo-past": ImportWizard.#onUndo,
      merge: ImportWizard.#onMerge,
      reparse: ImportWizard.#onReparse,
    },
  };

  #state: WizardState = emptyState();
  #bytes: Uint8Array | null = null;
  #closed = false;

  constructor(options = {}) {
    super(options);
    this.#state = emptyState({
      ruleset: readRuleset(),
      provider: (readProvider() as ProviderId) || "openai",
      model: readModel(),
      apiKey: readApiKey(),
      ollamaUrl: readOllamaUrl(),
    });
  }

  override async close(options?: object): Promise<this> {
    this.#closed = true;
    return super.close(options);
  }

  override async _renderHTML(): Promise<HTMLElement> {
    const template = document.createElement("template");
    template.innerHTML = renderWizard(this.#state, this.#pastImports()).trim();
    const root = template.content.firstElementChild;
    if (root instanceof HTMLElement && root.classList.contains("folio-wizard")) return root;
    const fallback = document.createElement("div");
    fallback.className = "folio-wizard";
    fallback.innerHTML = `<div class="folio-body"></div>`;
    return fallback;
  }

  override _replaceHTML(result: unknown, content: HTMLElement): void {
    if (!(result instanceof HTMLElement)) return;
    content.replaceChildren(result);
    this.#bind(result);
  }

  static async #onSubmit(_event: Event): Promise<void> {
    _event.preventDefault();
  }

  static async #onRead(this: ImportWizard): Promise<void> {
    await this.#readPdf();
  }

  static async #onStructure(this: ImportWizard): Promise<void> {
    await this.#structure();
  }

  static async #onCreate(this: ImportWizard): Promise<void> {
    await this.#create();
  }

  static async #onBack(this: ImportWizard): Promise<void> {
    this.#readForm();
    this.#state.step = "setup";
    this.#state.error = "";
    this.#state.plan = null;
    this.#state.result = null;
    await this.#show();
  }

  static async #onUndo(this: ImportWizard, _event: Event, target: HTMLElement): Promise<void> {
    const importId = target.dataset.import ?? this.#state.result?.importId;
    const title = target.dataset.title ?? this.#state.result?.title ?? "this import";
    if (!importId) return;
    if (!await confirmUndo(title)) return;
    const removed = await undoImport(importId);
    ui.notifications?.info(`Forge Scribe removed ${removed} document${removed === 1 ? "" : "s"}.`);
    if (this.#state.result?.importId === importId) {
      this.#state.step = "setup";
      this.#state.result = null;
    }
    await this.#show();
  }

  static async #onMerge(this: ImportWizard, _event: Event, target: HTMLElement): Promise<void> {
    this.#readForm();
    const chapterId = target.dataset.chapter;
    const sectionId = target.dataset.section;
    if (this.#state.plan && chapterId && sectionId) mergeSectionUp(this.#state.plan, chapterId, sectionId);
    await this.#show();
  }

  static async #onReparse(this: ImportWizard, _event: Event, target: HTMLElement): Promise<void> {
    this.#readForm();
    const actor = this.#state.plan?.actors.find((entry) => entry.id === target.dataset.actor);
    if (!actor?.statBlockText || !this.#state.plan) return;
    try {
      const parsed = fallbackNpcFromStatBlock(actor.npc.name, actor.statBlockText);
      const reconciled = reconcileNpc(parsed, actor.statBlockText);
      actor.npc = { ...reconciled.npc, name: actor.npc.name };
      actor.notes = reconciled.notes;
      await annotateSrd(this.#state.plan, (packId, name, mode) => liveHost().resolveSrd(packId, name, mode));
    } catch (error) {
      this.#state.error = error instanceof Error ? error.message : "Could not re-read that stat block.";
    }
    await this.#show();
  }

  async #readPdf(): Promise<void> {
    this.#readForm();
    this.#state.error = "";
    if (!game.user?.isGM) {
      this.#state.error = "Only the GM can import an adventure.";
      await this.#show();
      return;
    }
    if (game.system.id !== "dnd5e") {
      this.#state.error = "Forge Scribe imports into a dnd5e world.";
      await this.#show();
      return;
    }
    if (!versionAtLeast(game.system.version, "6.0.0")) {
      this.#state.error = `Forge Scribe needs dnd5e 6.0.0 or newer. This world has ${game.system.version}.`;
      await this.#show();
      return;
    }
    if (!this.#bytes) {
      this.#state.error = "Choose a PDF first.";
      await this.#show();
      return;
    }
    await this.#persistSettings();
    this.#state.busy = true;
    this.#state.step = "working";
    this.#state.status = "Reading the PDF in this browser…";
    await this.#show();
    try {
      const pages = await readPdfPages(this.#bytes.slice(), { start: this.#state.pageStart, end: this.#state.pageEnd });
      const extracted = extractDocument(pages);
      if (extracted.paragraphs.length === 0 && extracted.statBlocks.length === 0) {
        this.#extracted = null;
        this.#state.step = "setup";
        this.#state.error = extracted.warnings[0] ?? "No text was found in that page range. Scanned pages need OCR, which this version does not do.";
        return;
      }
      this.#extracted = extracted;
      const prose = formatProse(extracted);
      this.#state.statBlockNames = extracted.statBlocks.map((block) => block.name);
      this.#state.requestEstimate = (this.#state.useAi ? splitProse(prose).length : 0) + (this.#state.useAi ? extracted.statBlocks.length : 0);
      this.#state.step = "confirm";
      this.#state.error = extracted.warnings[0] ?? "";
    } catch (error) {
      this.#state.step = "setup";
      this.#state.error = error instanceof PdfRejected
        ? error.message
        : error instanceof Error ? error.message : "Could not read that PDF.";
    } finally {
      this.#state.busy = false;
      await this.#show();
    }
  }

  #extracted: ReturnType<typeof extractDocument> | null = null;

  async #structure(): Promise<void> {
    if (!this.#extracted) return;
    const provider = providerById(this.#state.provider);
    if (this.#state.useAi && provider.needsApiKey && !this.#state.apiKey.trim()) {
      this.#state.error = "Add an API key, or turn AI off to use headings only.";
      await this.#show();
      return;
    }
    this.#state.step = "working";
    this.#state.status = this.#state.useAi
      ? "Sending extracted text to your provider…"
      : "Building journals from headings…";
    this.#state.error = "";
    await this.#show();
    try {
      const client: LlmClient | null = this.#state.useAi ? {
        complete: (system, user) => completeChat({
          provider: this.#state.provider,
          apiKey: this.#state.apiKey,
          model: this.#state.model || provider.defaultModel,
          baseUrl: this.#state.ollamaUrl,
          system,
          user,
          maxTokens: 8192,
        }),
      } : null;
      const plan = await buildImportPlan({
        extracted: this.#extracted,
        ruleset: this.#state.ruleset,
        client,
      });
      await annotateSrd(plan, (packId, name, mode) => liveHost().resolveSrd(packId, name, mode));
      if (!game.packs.get(SRD_PACKS[plan.ruleset].actors)) {
        plan.warnings.push(`Compendium ${SRD_PACKS[plan.ruleset].actors} is not available. Monsters will be built from the stat blocks.`);
      }
      this.#state.plan = plan;
      this.#state.step = "review";
    } catch (error) {
      this.#state.step = "confirm";
      this.#state.error = error instanceof Error ? error.message : "Structuring failed.";
    }
    await this.#show();
  }

  async #create(): Promise<void> {
    this.#readForm();
    const plan = this.#state.plan;
    if (!plan) return;
    this.#state.step = "working";
    this.#state.status = "Creating journals and actors…";
    await this.#show();
    try {
      const result = await createImport(plan, liveHost(), { exportAdventure: this.#state.exportAdventure });
      await rememberImport({
        id: result.importId,
        title: result.title,
        createdAt: new Date().toISOString(),
        ...(result.adventurePack ? { adventurePack: result.adventurePack } : {}),
      });
      this.#state.result = {
        importId: result.importId,
        title: result.title,
        journals: result.journalIds.length,
        actors: result.actorIds.length,
        ...(result.adventurePack ? { adventurePack: result.adventurePack } : {}),
        warnings: result.warnings,
      };
      this.#state.step = "done";
      ui.notifications?.info(`Forge Scribe created ${result.journalIds.length} journals and ${result.actorIds.length} actors.`);
    } catch (error) {
      this.#state.step = "review";
      this.#state.error = error instanceof Error ? error.message : "Foundry rejected the documents.";
    }
    await this.#show();
  }

  #bind(root: HTMLElement): void {
    root.querySelector<HTMLInputElement>("input[name=pdf]")?.addEventListener("change", (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      void this.#takeFile(file);
    });
    root.querySelector<HTMLSelectElement>("select[name=provider]")?.addEventListener("change", () => {
      this.#readForm();
      void this.#show();
    });
  }

  async #takeFile(file: File): Promise<void> {
    this.#bytes = new Uint8Array(await file.arrayBuffer());
    this.#state.fileName = file.name;
    this.#state.error = "";
    try {
      this.#state.pageCount = await countPdfPages(this.#bytes.slice());
      this.#state.pageStart = 1;
      this.#state.pageEnd = this.#state.pageCount;
    } catch (error) {
      this.#bytes = null;
      this.#state.pageCount = 0;
      this.#state.error = error instanceof PdfRejected
        ? error.message
        : error instanceof Error ? error.message : "Could not open that PDF.";
    }
    await this.#show();
  }

  #readForm(): void {
    const root = this.element;
    if (!root) return;
    const value = (name: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? "";
    const checked = (name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked ?? false;
    if (root.querySelector("[name=ruleset]")) this.#state.ruleset = value("ruleset") === "2014" ? "2014" : "2024";
    if (root.querySelector("[name=provider]")) this.#state.provider = (value("provider") as ProviderId) || "openai";
    if (root.querySelector("[name=model]")) this.#state.model = value("model");
    if (root.querySelector("[name=apiKey]")) this.#state.apiKey = value("apiKey");
    if (root.querySelector("[name=ollamaUrl]")) this.#state.ollamaUrl = value("ollamaUrl");
    if (root.querySelector("[name=useAi]")) this.#state.useAi = checked("useAi");
    if (root.querySelector("[name=exportAdventure]")) this.#state.exportAdventure = checked("exportAdventure");
    const start = Number(value("pageStart"));
    const end = Number(value("pageEnd"));
    if (Number.isFinite(start) && start > 0) this.#state.pageStart = start;
    if (Number.isFinite(end) && end > 0) this.#state.pageEnd = end;
    const plan = this.#state.plan;
    if (!plan) return;
    root.querySelectorAll<HTMLInputElement>("[name=chapter-include]").forEach((input) => {
      const chapter = plan.chapters.find((entry) => entry.id === input.dataset.id);
      if (chapter) chapter.include = input.checked;
    });
    root.querySelectorAll<HTMLInputElement>("[name=section-include]").forEach((input) => {
      const chapterId = input.dataset.chapter;
      const sectionId = input.dataset.id;
      if (chapterId && sectionId) setSectionIncluded(plan, chapterId, sectionId, input.checked);
    });
    root.querySelectorAll<HTMLInputElement>("[name=section-title]").forEach((input) => {
      const chapterId = input.dataset.chapter;
      const sectionId = input.dataset.id;
      if (chapterId && sectionId) renameSection(plan, chapterId, sectionId, input.value);
    });
    root.querySelectorAll<HTMLInputElement>("[name=actor-include]").forEach((input) => {
      if (input.dataset.id) setActorIncluded(plan, input.dataset.id, input.checked);
    });
    root.querySelectorAll<HTMLInputElement>("[name=actor-name]").forEach((input) => {
      if (input.dataset.id) renameActor(plan, input.dataset.id, input.value);
    });
    root.querySelectorAll<HTMLSelectElement>("[name=actor-source]").forEach((input) => {
      if (input.dataset.id) setActorSource(plan, input.dataset.id, input.value === "srd" ? "srd" : "custom");
    });
    const numbers = new Map<string, { ac?: number; hp?: number; cr?: number | null }>();
    const take = (name: string, field: "ac" | "hp" | "cr") => {
      root.querySelectorAll<HTMLInputElement>(`[name=${name}]`).forEach((input) => {
        const id = input.dataset.id;
        if (!id) return;
        const current = numbers.get(id) ?? {};
        if (field === "cr" && input.value.trim() === "") current.cr = null;
        else current[field] = Number(input.value);
        numbers.set(id, current);
      });
    };
    take("actor-ac", "ac");
    take("actor-hp", "hp");
    take("actor-cr", "cr");
    for (const [id, values] of numbers) setActorNumbers(plan, id, values);
  }

  async #persistSettings(): Promise<void> {
    await writeRuleset(this.#state.ruleset);
    await writeProvider(this.#state.provider);
    await writeModel(this.#state.model);
    await writeOllamaUrl(this.#state.ollamaUrl);
    if (this.#state.apiKey) await writeApiKey(this.#state.apiKey);
  }

  #pastImports() {
    try {
      return readImportLog();
    } catch {
      return [];
    }
  }

  async #show(): Promise<void> {
    if (this.#closed) return;
    await this.render(true);
  }
}
