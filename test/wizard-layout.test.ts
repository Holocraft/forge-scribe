import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ImportRecord } from "../src/foundry/settings.ts";
import type { ImportPlan, PlanActor } from "../src/plan/types.ts";
import { renderWizard } from "../src/ui/render.ts";
import { emptyState, type ImportSummary } from "../src/ui/state.ts";

/**
 * Split the wizard markup into the scrolling body and the pinned footer.
 * Nested divs (cards, grids) stay inside the body; only the footer that
 * follows the body is returned as actions.
 */
function shell(html: string): { body: string; actions: string } {
  const start = html.indexOf('<div class="folio-body">');
  expect(start).toBeGreaterThanOrEqual(0);
  const tag = /<\/?div\b[^>]*>/g;
  tag.lastIndex = start;
  let depth = 0;
  let end = -1;
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) {
      end = tag.lastIndex;
      break;
    }
  }
  expect(end).toBeGreaterThan(start);
  const body = html.slice(start, end);
  const actions = html.slice(end).match(/<div class="folio-actions">([\s\S]*)<\/div>/)?.[1] ?? "";
  return { body, actions };
}

const actor = {
  id: "giant-blade-spider",
  include: true,
  source: "custom",
  match: "custom",
  notes: ["Challenge rating was not printed."],
  srdNotes: [],
  npc: { name: "Giant Blade Spider", ac: 13, hp: 20, abilities: { str: 10, dex: 16, con: 12, int: 2, wis: 10, cha: 4 } },
  statBlockText: "Giant Blade Spider",
} as PlanActor;

const plan = {
  title: "The Hunted Queen",
  ruleset: "2014",
  warnings: ["Compendium dnd5e.monsters is not available."],
  usedAi: false,
  chapters: [
    {
      id: "intro",
      title: "Introduction",
      include: true,
      sections: [
        { id: "overview", title: "Overview", include: true, sourcePages: [1], paragraphs: [] },
        { id: "letter", title: "The letter", include: true, sourcePages: [1], paragraphs: [{ text: "My queen", readAloud: true }] },
      ],
    },
    {
      id: "scene-2",
      title: "Scene 2: The desert oasis",
      include: true,
      sections: [
        { id: "oasis", title: "Scene 2: The desert oasis", include: true, sourcePages: [1], paragraphs: [] },
      ],
    },
  ],
  actors: [actor],
} as ImportPlan;

const result: ImportSummary = {
  importId: "import-1",
  title: "The Hunted Queen",
  journals: 2,
  actors: 1,
  warnings: ["One name did not match the SRD."],
};

const past: ImportRecord[] = [
  { id: "import-1", title: "The Hunted Queen", createdAt: "2026-01-01T00:00:00.000Z" },
];

describe("wizard scroll shell", () => {
  it("pins each step's buttons under a scrolling body", () => {
    const cases: { name: string; html: string; actions: string[]; inBody: string[] }[] = [
      {
        name: "setup",
        html: renderWizard(emptyState(), past),
        actions: ["read-pdf"],
        inBody: ["Past imports", 'name="pdf"', "undo-past"],
      },
      {
        name: "confirm",
        html: renderWizard(emptyState({
          step: "confirm",
          fileName: "hunted-queen.pdf",
          pageStart: 1,
          pageEnd: 2,
          useAi: false,
          statBlockNames: Array.from({ length: 40 }, (_, index) => `Creature ${index + 1}`),
        }), []),
        actions: ["back", "structure"],
        inBody: ["Creature 40", "hunted-queen.pdf"],
      },
      {
        name: "review",
        html: renderWizard(emptyState({ step: "review", plan, exportAdventure: true }), []),
        actions: ["back", "create"],
        inBody: ["The Hunted Queen", "Scene 2: The desert oasis", "Giant Blade Spider", "exportAdventure", "reparse", "Merge up"],
      },
      {
        name: "done",
        html: renderWizard(emptyState({ step: "done", result }), past),
        actions: ["undo", "back"],
        inBody: ["is in the world", "did not match the SRD"],
      },
    ];

    for (const step of cases) {
      const parts = shell(step.html);
      expect(parts.body, step.name).not.toMatch(/class="folio-actions"/);
      for (const action of step.actions) {
        expect(parts.actions, `${step.name} footer`).toContain(`data-action="${action}"`);
        expect(parts.body, `${step.name} body`).not.toContain(`data-action="${action}"`);
      }
      for (const text of step.inBody) {
        expect(parts.body, `${step.name} body`).toContain(text);
      }
    }
  });

  it("leaves the working step as a scrolling body with no footer", () => {
    const html = renderWizard(emptyState({ step: "working", status: "Reading the PDF in this browser…" }), []);
    const parts = shell(html);
    expect(parts.body).toContain("Reading the PDF in this browser");
    expect(parts.actions).toBe("");
    expect(html).not.toContain("folio-actions");
  });
});

describe("wizard window css", () => {
  const css = readFileSync("src/styles.css", "utf8");

  it("shrinks the ApplicationV2 content column and scrolls the step body", () => {
    expect(css).toMatch(/\.folio-window > \.window-content\s*\{[^}]*min-height:\s*0/);
    expect(css).toMatch(/\.folio-window > \.window-content\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.folio-wizard\s*\{[^}]*min-height:\s*0/);
    expect(css).toMatch(/\.folio-body\s*\{[^}]*min-height:\s*0/);
    expect(css).toMatch(/\.folio-body\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.folio-actions\s*\{[^}]*flex:\s*0 0 auto/);
  });
});
