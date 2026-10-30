import { escapeHtml } from "../html.ts";
import { providerById } from "../llm/providers.ts";
import type { ImportRecord } from "../foundry/settings.ts";
import type { PlanActor } from "../plan/types.ts";
import type { WizardState } from "./state.ts";

const NOTICE = "Only import PDFs you own or that are freely licensed. Forge Scribe reads the file in this browser and sends extracted text only to the provider you choose. It does not upload the PDF. Not legal advice.";

export function renderWizard(state: WizardState, imports: ImportRecord[]): string {
  if (state.step === "working") return working(state);
  if (state.step === "confirm") return confirm(state);
  if (state.step === "review" && state.plan) return review(state);
  if (state.step === "done" && state.result) return done(state, imports);
  return setup(state, imports);
}

function notice(): string {
  return `<p class="folio-notice">${NOTICE}</p>`;
}

function errorBlock(error: string): string {
  return error ? `<p class="folio-error">${escapeHtml(error)}</p>` : "";
}

function setup(state: WizardState, imports: ImportRecord[]): string {
  const provider = providerById(state.provider);
  const past = imports.length === 0 ? "" : `
    <section class="folio-past">
      <h3>Past imports</h3>
      <ul>
        ${imports.map((entry) => `
          <li>
            <span>${escapeHtml(entry.title)}</span>
            <button type="button" data-action="undo-past" data-import="${escapeHtml(entry.id)}" data-title="${escapeHtml(entry.title)}">Undo</button>
          </li>`).join("")}
      </ul>
    </section>`;
  return `
    <div class="folio-wizard">
      ${notice()}
      ${errorBlock(state.error)}
      <p class="folio-lead">Pick a text PDF, a page range, and the rules your monsters should use. Scenes and maps are not part of this version.</p>
      <div class="folio-grid">
        <label>PDF
          <input type="file" name="pdf" accept="application/pdf,.pdf">
          ${state.fileName ? `<span class="folio-file">${escapeHtml(state.fileName)} · ${state.pageCount} pages</span>` : ""}
        </label>
        <label>Rules
          <select name="ruleset">
            <option value="2024" ${state.ruleset === "2024" ? "selected" : ""}>2024 (SRD 5.2)</option>
            <option value="2014" ${state.ruleset === "2014" ? "selected" : ""}>2014 (SRD 5.1)</option>
          </select>
        </label>
        <label>First page
          <input name="pageStart" type="number" min="1" max="${Math.max(state.pageCount, 1)}" value="${state.pageStart}">
        </label>
        <label>Last page
          <input name="pageEnd" type="number" min="1" max="${Math.max(state.pageCount, 1)}" value="${state.pageEnd}">
        </label>
        <label>Provider
          <select name="provider">
            <option value="openai" ${state.provider === "openai" ? "selected" : ""}>OpenAI</option>
            <option value="anthropic" ${state.provider === "anthropic" ? "selected" : ""}>Anthropic</option>
            <option value="ollama" ${state.provider === "ollama" ? "selected" : ""}>Ollama on this machine</option>
          </select>
        </label>
        <label>Model
          <input name="model" type="text" value="${escapeHtml(state.model || provider.defaultModel)}" autocomplete="off">
        </label>
        ${provider.needsApiKey ? `
          <label class="folio-span">API key
            <input name="apiKey" type="password" value="${escapeHtml(state.apiKey)}" autocomplete="off" spellcheck="false">
          </label>` : `
          <label class="folio-span">Ollama URL
            <input name="ollamaUrl" type="text" value="${escapeHtml(state.ollamaUrl)}">
          </label>
          <p class="folio-hint">Ollama must allow this site. Start it with <code>OLLAMA_ORIGINS=*</code> if the browser blocks the request.</p>`}
      </div>
      <label class="folio-check"><input name="useAi" type="checkbox" ${state.useAi ? "checked" : ""}> Use AI to mark read-aloud text and clean up stat blocks</label>
      <div class="folio-actions">
        <button type="button" data-action="read-pdf" ${state.busy ? "disabled" : ""}>Read PDF</button>
      </div>
      ${past}
    </div>`;
}

function confirm(state: WizardState): string {
  const names = state.statBlockNames.length
    ? state.statBlockNames.map((name) => `<li>${escapeHtml(name)}</li>`).join("")
    : "<li>No stat blocks detected.</li>";
  return `
    <div class="folio-wizard">
      ${notice()}
      ${errorBlock(state.error)}
      <h3>${escapeHtml(state.fileName)}</h3>
      <p>Pages ${state.pageStart}–${state.pageEnd}. ${state.useAi ? `About ${state.requestEstimate} AI request${state.requestEstimate === 1 ? "" : "s"}.` : "AI is off. Headings and printed numbers will be used."}</p>
      <ul>${names}</ul>
      <div class="folio-actions">
        <button type="button" data-action="back">Back</button>
        <button type="button" data-action="structure">Continue</button>
      </div>
    </div>`;
}

function working(state: WizardState): string {
  return `
    <div class="folio-wizard">
      ${notice()}
      <p class="folio-status">${escapeHtml(state.status || "Working…")}</p>
    </div>`;
}

function review(state: WizardState): string {
  const plan = state.plan;
  if (!plan) return setup(state, []);
  const warnings = plan.warnings.length
    ? `<ul class="folio-warnings">${plan.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : "";
  const chapters = plan.chapters.map((chapter) => `
    <details class="folio-chapter" open>
      <summary>
        <label><input type="checkbox" name="chapter-include" data-id="${escapeHtml(chapter.id)}" ${chapter.include ? "checked" : ""}> ${escapeHtml(chapter.title)}</label>
      </summary>
      ${chapter.sections.map((section, index) => `
        <div class="folio-section">
          <label><input type="checkbox" name="section-include" data-chapter="${escapeHtml(chapter.id)}" data-id="${escapeHtml(section.id)}" ${section.include ? "checked" : ""}></label>
          <input name="section-title" data-chapter="${escapeHtml(chapter.id)}" data-id="${escapeHtml(section.id)}" value="${escapeHtml(section.title)}">
          <span class="folio-pages">p. ${section.sourcePages.join(", ") || "?"}</span>
          ${index > 0 ? `<button type="button" data-action="merge" data-chapter="${escapeHtml(chapter.id)}" data-section="${escapeHtml(section.id)}">Merge up</button>` : ""}
          ${section.paragraphs.some((paragraph) => paragraph.readAloud) ? `<span class="folio-badge">Read-aloud</span>` : ""}
        </div>`).join("")}
    </details>`).join("");
  const actors = plan.actors.map((actor) => actorCard(actor)).join("");
  return `
    <div class="folio-wizard">
      ${notice()}
      ${errorBlock(state.error)}
      <h3>${escapeHtml(plan.title)}</h3>
      <p>${plan.usedAi ? "Structured with AI. " : "Structured from headings. "}Uncheck anything you do not want created. Rename boxes before you create.</p>
      ${warnings}
      <section><h3>Journals</h3>${chapters}</section>
      <section><h3>Actors</h3>${actors || "<p>No stat blocks.</p>"}</section>
      <label class="folio-check"><input name="exportAdventure" type="checkbox" ${state.exportAdventure ? "checked" : ""}> Also save an Adventure compendium in this world</label>
      <div class="folio-actions">
        <button type="button" data-action="back">Back</button>
        <button type="button" data-action="create">Create documents</button>
      </div>
    </div>`;
}

function actorCard(actor: PlanActor): string {
  const badge = actor.match === "srd"
    ? "SRD"
    : actor.match === "srd-changed"
      ? "SRD, stats differ"
      : "From stat block";
  const notes = [...actor.notes, ...actor.srdNotes];
  return `
    <article class="folio-card">
      <header>
        <label><input type="checkbox" name="actor-include" data-id="${escapeHtml(actor.id)}" ${actor.include ? "checked" : ""}></label>
        <input name="actor-name" data-id="${escapeHtml(actor.id)}" value="${escapeHtml(actor.npc.name)}">
        <span class="folio-badge">${badge}</span>
      </header>
      ${notes.length ? `<ul class="folio-notes">${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
      <div class="folio-grid">
        <label>AC <input name="actor-ac" data-id="${escapeHtml(actor.id)}" type="number" min="1" max="40" value="${actor.npc.ac}"></label>
        <label>HP <input name="actor-hp" data-id="${escapeHtml(actor.id)}" type="number" min="1" max="2000" value="${actor.npc.hp}"></label>
        <label>CR <input name="actor-cr" data-id="${escapeHtml(actor.id)}" type="number" min="0" max="30" step="0.125" value="${actor.npc.cr ?? ""}" placeholder="unset"></label>
        <label>Build
          <select name="actor-source" data-id="${escapeHtml(actor.id)}">
            <option value="custom" ${actor.source === "custom" ? "selected" : ""}>From the stat block</option>
            <option value="srd" ${actor.source === "srd" ? "selected" : ""} ${actor.srd ? "" : "disabled"}>Copy the SRD actor</option>
          </select>
        </label>
      </div>
      ${actor.statBlockText ? `<button type="button" data-action="reparse" data-actor="${escapeHtml(actor.id)}">Re-read stat block</button>` : ""}
    </article>`;
}

function done(state: WizardState, imports: ImportRecord[]): string {
  const result = state.result;
  if (!result) return setup(state, imports);
  const warnings = result.warnings.length
    ? `<ul class="folio-warnings">${result.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : "";
  return `
    <div class="folio-wizard">
      ${notice()}
      <h3>${escapeHtml(result.title)} is in the world</h3>
      <p>${result.journals} journal${result.journals === 1 ? "" : "s"}, ${result.actors} actor${result.actors === 1 ? "" : "s"}.${result.adventurePack ? ` Adventure compendium: ${escapeHtml(result.adventurePack)}.` : ""}</p>
      ${warnings}
      <p>Read-aloud text is in a shaded box. Creature names in the journals link to the actors. Maps are not imported; Bindery can pull art out of the same PDF.</p>
      <div class="folio-actions">
        <button type="button" data-action="undo" data-import="${escapeHtml(result.importId)}" data-title="${escapeHtml(result.title)}">Undo import</button>
        <button type="button" data-action="back">Import another</button>
      </div>
    </div>`;
}
