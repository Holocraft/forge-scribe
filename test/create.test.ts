import { describe, expect, it } from "vitest";
import { createImport, type CreatedDoc, type ImportHost } from "../src/foundry/create.ts";
import { sequenceIds } from "../src/ids.ts";
import type { ImportPlan } from "../src/plan/types.ts";

function plan(): ImportPlan {
  return {
    title: "The Hunted Queen",
    ruleset: "2014",
    warnings: [],
    usedAi: false,
    chapters: [{
      id: "scene-1",
      title: "Scene 1: The ambush",
      include: true,
      sections: [{
        id: "ambush",
        title: "The ambush",
        include: true,
        sourcePages: [1],
        paragraphs: [
          { text: "The assassin sends a Giant Blade Spider.", readAloud: false },
          { text: "Snow falls on the road.", readAloud: true },
        ],
      }],
    }],
    actors: [{
      id: "giant-blade-spider",
      include: true,
      source: "custom",
      match: "custom",
      notes: ["No Challenge rating was printed."],
      srdNotes: [],
      sourcePage: 2,
      npc: {
        name: "Giant Blade Spider",
        ac: 13,
        hp: 20,
        hpFormula: "4d8+2",
        abilities: { str: 12, dex: 16, con: 13, int: 3, wis: 12, cha: 4 },
        creatureType: "beast",
        size: "med",
        actions: [{
          name: "Stab",
          kind: "attack",
          toHit: 5,
          reachFt: 5,
          damage: [{ formula: "1d6+3", type: "piercing" }],
        }],
        gear: ["studded leather"],
      },
    }],
  };
}

function host() {
  const created: { kind: string; data: Record<string, unknown> }[] = [];
  let n = 0;
  const doc = (name: string, data: Record<string, unknown>): CreatedDoc => {
    const id = `doc${n++}`;
    created.push({ kind: name, data });
    return {
      id,
      name: String(data.name ?? name),
      uuid: `${name}.${id}`,
      toObject: () => ({ ...data, _id: id }),
      toCompendium: () => ({ ...data, _id: id }),
    };
  };
  const api: ImportHost = {
    async createFolder(data) {
      created.push({ kind: "folder", data });
      return { id: `folder${n++}` };
    },
    async createActors(list) {
      return list.map((data) => doc("Actor", data));
    },
    async createJournal(data) {
      return doc("JournalEntry", data);
    },
    async resolveSrd(packId, name) {
      if (packId === "dnd5e.items" && name === "studded leather") {
        return {
          id: "leather",
          uuid: "Compendium.dnd5e.items.Item.leather",
          name: "Studded Leather Armor",
          system: { equipped: false },
          toObject: () => ({ name: "Studded Leather Armor", type: "equipment", system: { equipped: false } }),
        };
      }
      return null;
    },
    async exportAdventure(args) {
      created.push({ kind: "adventure", data: { actors: args.actors.length, journals: args.journals.length } });
      return "world.folio-test";
    },
  };
  return { api, created };
}

describe("createImport", () => {
  it("creates flagged documents and links the journal to the actor", async () => {
    const world = host();
    const result = await createImport(plan(), world.api, { exportAdventure: true, newId: sequenceIds("im") });
    expect(result.actorIds).toHaveLength(1);
    expect(result.journalIds).toHaveLength(1);
    expect(result.adventurePack).toBe("world.folio-test");
    expect(result.warnings.some((warning) => warning.includes("studded leather"))).toBe(false);

    const actor = world.created.find((entry) => entry.kind === "Actor");
    expect(actor?.data.folder).toBeTruthy();
    expect((actor?.data.flags as { "forge-scribe": { importId: string } })["forge-scribe"].importId).toBe(result.importId);
    const items = actor?.data.items as { name: string }[];
    expect(items.some((item) => item.name === "Studded Leather Armor")).toBe(true);
    expect(items.some((item) => item.name === "Stab")).toBe(true);

    const journal = world.created.find((entry) => entry.kind === "JournalEntry");
    const pages = journal?.data.pages as { text: { content: string; format: number } }[];
    const html = pages[0]?.text.content ?? "";
    expect(pages[0]?.text.format).toBe(1);
    expect(html).toContain("folio-read-aloud");
    expect(html).toContain(`@UUID[Actor.${result.actorIds[0]}]{Giant Blade Spider}`);
    expect(html).not.toContain("@@folio:");
    expect(html).not.toContain("<script>");
  });
});
