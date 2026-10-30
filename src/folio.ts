import "./styles.css";
import { MODULE_ID } from "./constants.ts";
import { registerSettings } from "./foundry/settings.ts";
import { undoImport } from "./foundry/undo.ts";
import { ImportWizard } from "./ui/wizard.ts";

export { MODULE_ID };

/**
 * Foundry loads this file because module.json lists it under `esmodules`.
 * The `init` hook runs while the world is starting, before documents are ready.
 * That is the right time to register settings. The journal button waits until
 * the sidebar actually renders.
 */

function rootElement(value: unknown): HTMLElement | null {
  if (value instanceof HTMLElement) return value;
  if (value && typeof value === "object" && "0" in value) {
    const first = (value as { 0?: unknown })[0];
    if (first instanceof HTMLElement) return first;
  }
  return null;
}

function openWizard(event?: Event): void {
  event?.preventDefault();
  if (!game.user?.isGM) {
    ui.notifications?.warn("Only the GM can import an adventure.");
    return;
  }
  void new ImportWizard().render(true);
}

Hooks.once("init", () => {
  registerSettings();
  game.settings.registerMenu(MODULE_ID, "openWizard", {
    name: "FOLIO.Settings.Open.name",
    label: "FOLIO.Settings.Open.label",
    hint: "FOLIO.Settings.Open.hint",
    icon: "fas fa-book-open",
    type: ImportWizard,
    restricted: true,
  });
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = { openWizard, undoImport };
  }
});

Hooks.on("renderJournalDirectory", (_app: unknown, html: unknown) => {
  if (!game.user?.isGM) return;
  const root = rootElement(html);
  const actions = root?.querySelector(".header-actions") ?? root?.querySelector("header");
  if (!actions || actions.querySelector(".folio-open")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "folio-open";
  button.innerHTML = `<i class="fas fa-book-open"></i> Folio`;
  button.addEventListener("click", openWizard);
  actions.prepend(button);
});
