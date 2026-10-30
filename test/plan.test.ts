import { describe, expect, it } from "vitest";
import { buildImportPlan } from "../src/plan/build.ts";
import { mergeSectionUp, renameActor, setActorNumbers } from "../src/plan/edit.ts";
import { annotateSrd } from "../src/plan/annotate.ts";
import { extractDocument } from "../src/pdf/extract.ts";
import type { LlmClient } from "../src/llm/run.ts";
import { loadHuntedQueen } from "./helpers/pdf.ts";

describe("import plan", () => {
  it("builds journals and actors from The Hunted Queen without a model", async () => {
    const extracted = extractDocument(await loadHuntedQueen());
    const plan = await buildImportPlan({ extracted, ruleset: "2014", client: null });
    expect(plan.usedAi).toBe(false);
    expect(plan.title).toBe("The Hunted Queen");
    const prose = plan.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.paragraphs.map((paragraph) => paragraph.text))).join("\n");
    expect(prose).toContain("Queen Kalia of Bragod");
    expect(prose).toContain("5-year-old");
    const titles = plan.chapters.map((chapter) => chapter.title);
    expect(titles).toEqual(expect.arrayContaining([
      "Introduction",
      "Scene 1: The ambush",
      "Scene 2: The desert oasis",
      "Creatures",
    ]));
    expect(titles.some((title) => title.startsWith("Scene 4:"))).toBe(true);
    const letter = plan.chapters.flatMap((chapter) => chapter.sections).find((section) => section.title === "The letter");
    expect(letter?.paragraphs.some((paragraph) => paragraph.readAloud && paragraph.text.includes("My queen"))).toBe(true);
    expect(plan.actors.map((actor) => actor.npc.name).sort()).toEqual([
      "Ampheryn",
      "Doppelganger",
      "Giant Blade Spider",
      "Snake's Errant Assassin",
    ]);
    const spider = plan.actors.find((actor) => actor.id === "giant-blade-spider");
    expect(spider?.npc.ac).toBe(13);
    expect(spider?.notes.some((note) => note.includes("Challenge"))).toBe(true);

    const intro = plan.chapters.find((chapter) => chapter.title === "Introduction");
    const letterId = intro?.sections.find((section) => section.title === "The letter")?.id;
    if (intro && letterId) mergeSectionUp(plan, intro.id, letterId);
    expect(intro?.sections.some((section) => section.title === "The letter")).toBe(false);
    expect(intro?.sections[0]?.paragraphs.some((paragraph) => paragraph.text.includes("My queen"))).toBe(true);

    renameActor(plan, "giant-blade-spider", "Blade Spider");
    setActorNumbers(plan, "giant-blade-spider", { ac: 14, cr: 1 });
    expect(spider?.npc.name).toBe("Blade Spider");
    expect(spider?.npc.ac).toBe(14);
    expect(spider?.npc.cr).toBe(1);
  });

  it("uses a valid model outline and falls back when the model keeps failing", async () => {
    const extracted = extractDocument(await loadHuntedQueen());
    const good: LlmClient = {
      async complete(_system, user) {
        if (user.startsWith("Stat block name:")) {
          return JSON.stringify({
            name: "Ignored",
            ac: 18,
            hp: 50,
            abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            cr: 8,
          });
        }
        return JSON.stringify({
          title: "Queen of Bragod",
          chapters: [{
            title: "Opening",
            sections: [{
              title: "Hook",
              sourcePages: [1],
              paragraphs: [{ readAloud: true, text: "Queen Kalia of Bragod was married for her beauty." }],
            }],
          }],
        });
      },
    };
    const plan = await buildImportPlan({ extracted, ruleset: "2024", client: good });
    expect(plan.usedAi).toBe(true);
    expect(plan.title).toBe("Queen of Bragod");
    expect(plan.chapters.some((chapter) => chapter.title === "Creatures")).toBe(true);
    const spider = plan.actors.find((actor) => actor.npc.name === "Giant Blade Spider");
    expect(spider?.npc.ac).toBe(13);
    expect(spider?.npc.hp).toBe(20);
    expect(spider?.npc.cr).toBeUndefined();
    expect(spider?.notes.join(" | ")).toContain("AC:");

    let calls = 0;
    const bad: LlmClient = {
      async complete() {
        calls += 1;
        return "{\"type\":\"npc\",\"system\":{}}";
      },
    };
    const fallback = await buildImportPlan({ extracted, ruleset: "2014", client: bad });
    expect(fallback.usedAi).toBe(false);
    expect(fallback.warnings.some((warning) => warning.includes("AI structure failed"))).toBe(true);
    expect(fallback.actors.find((actor) => actor.id === "ampheryn")?.npc.ac).toBe(15);
    expect(calls).toBeGreaterThan(2);
  });

  it("marks an SRD name match and a changed stat block", async () => {
    const extracted = extractDocument(await loadHuntedQueen());
    const plan = await buildImportPlan({ extracted, ruleset: "2014", client: null });
    await annotateSrd(plan, async (packId, name) => {
      if (packId !== "dnd5e.monsters" || name !== "Doppelganger") return null;
      return {
        id: "doppelganger",
        uuid: "Compendium.dnd5e.monsters.Actor.doppelganger",
        name: "Doppelganger",
        system: { attributes: { ac: { flat: 14 }, hp: { max: 52 } }, details: { cr: 3 } },
        toObject: () => ({ name: "Doppelganger" }),
      };
    });
    const doppelganger = plan.actors.find((actor) => actor.npc.name === "Doppelganger");
    expect(doppelganger?.match).toBe("srd-changed");
    expect(doppelganger?.source).toBe("srd");
    expect(doppelganger?.srdNotes.some((note) => note.includes("HP"))).toBe(true);
    const spider = plan.actors.find((actor) => actor.id === "giant-blade-spider");
    expect(spider?.match).toBe("custom");
    expect(spider?.source).toBe("custom");
  });
});
