import { describe, expect, it } from "vitest";
import { sequenceIds } from "../src/ids.ts";
import { npcToActorData } from "../src/mapping/actor.ts";
import { applyActorLinks, renderSectionHtml } from "../src/mapping/journal.ts";
import { matchCompendiumName } from "../src/mapping/names.ts";
import { reconcileNpc } from "../src/mapping/reconcile.ts";
import { actorDataFromSrd, readCreatureStats } from "../src/mapping/srd.ts";
import { skillFromPrintedBonus } from "../src/mapping/skills.ts";
import { fallbackNpcFromStatBlock } from "../src/mapping/stat-parse.ts";
import { extractDocument } from "../src/pdf/extract.ts";
import { loadHuntedQueen } from "./helpers/pdf.ts";

interface ActivityView {
  type: string;
  activation: { type: string };
  attack?: { bonus: string; flat: boolean };
  save?: { ability: string[]; dc: { formula: string } };
  damage?: { parts: { number: number; denomination: number; bonus: string; types: string[] }[]; onSave?: string };
}

function activity(item: { system: { activities: Record<string, ActivityView> } }, type: string) {
  return Object.values(item.system.activities).find((entry) => entry.type === type);
}

describe("compendium names", () => {
  const monsters = ["Goblin", "Goblin Warrior", "Goblin Boss", "Giant Rat", "Wolf"];

  it("matches plurals without grabbing a longer name", () => {
    expect(matchCompendiumName("Goblins", monsters, "monster")?.name).toBe("Goblin");
    expect(matchCompendiumName("the Goblin", monsters, "monster")?.name).toBe("Goblin");
    expect(matchCompendiumName("Giant Rats", monsters, "monster")?.name).toBe("Giant Rat");
    expect(matchCompendiumName("Wolves", monsters, "monster")?.name).toBe("Wolf");
    expect(matchCompendiumName("Goblin", ["Goblin Warrior", "Goblin Boss"], "monster")).toBeNull();
  });

  it("lets gear match a longer unique SRD name", () => {
    const gear = ["Studded Leather Armor", "Leather Armor", "Shield"];
    expect(matchCompendiumName("studded leather", gear, "gear")?.name).toBe("Studded Leather Armor");
    expect(matchCompendiumName("leather", gear, "gear")).toBeNull();
  });
});

describe("stat block to dnd5e", () => {
  it("maps The Hunted Queen creatures from the printed blocks", async () => {
    const extracted = extractDocument(await loadHuntedQueen());
    const byName = (name: string) => {
      const block = extracted.statBlocks.find((entry) => entry.name === name);
      if (!block) throw new Error(name);
      return fallbackNpcFromStatBlock(block.name, block.text);
    };

    const spider = byName("Giant Blade Spider");
    const spiderActor = npcToActorData(spider, { ruleset: "2014", newId: sequenceIds("sp") });
    expect(spiderActor.system.attributes.ac).toEqual({ flat: 13, calc: "flat" });
    expect(spiderActor.system.attributes.hp.max).toBe(20);
    expect(spiderActor.system.attributes.hp.formula).toBe("4d8+2");
    expect(spiderActor.system.abilities.dex.value).toBe(16);
    expect(spiderActor.system.abilities.int.value).toBe(3);
    expect(spiderActor.system.details.type.value).toBe("beast");
    expect(spiderActor.system.traits.size).toBe("med");
    expect(spiderActor.system.attributes.movement.climb).toBe("40");
    expect(spiderActor.system.details.cr).toBe(0);
    expect(spiderActor.system.details.source.rules).toBe("2014");

    const stab = spiderActor.items.find((item) => item.name === "Stab");
    const stabAttack = stab ? activity(stab, "attack") : undefined;
    expect(stabAttack?.attack).toMatchObject({ flat: true, bonus: "+5" });
    expect(stabAttack?.damage?.parts[0]).toMatchObject({ number: 1, denomination: 6, bonus: "3", types: ["piercing"] });
    expect(stab?.system.description.value).toContain("[[/attack extended]]");
    expect(stab?.system.description.value).toContain("[[/damage 1d6+3 piercing]]");

    const pounce = spiderActor.items.find((item) => item.name === "Pounce");
    const pounceSave = pounce ? activity(pounce, "save") : undefined;
    expect(pounceSave?.save?.ability).toEqual(["str", "dex"]);
    expect(pounceSave?.save?.dc.formula).toBe("12");
    expect(pounceSave?.damage?.onSave).toBe("none");
    expect(pounceSave?.damage?.parts[0]?.types).toEqual(["slashing"]);

    const ampheryn = npcToActorData(byName("Ampheryn"), { ruleset: "2024", newId: sequenceIds("am") });
    expect(ampheryn.system.abilities.int.value).toBe(20);
    expect(ampheryn.system.attributes.ac.flat).toBe(15);
    const bolt = ampheryn.items.find((item) => item.name === "Fire bolt");
    expect(activity(bolt!, "attack")?.attack?.bonus).toBe("+8");
    expect(ampheryn.items.find((item) => item.name === "Shield other")?.system.activities).toBeTruthy();
    const shield = Object.values(ampheryn.items.find((item) => item.name === "Shield other")!.system.activities)[0];
    expect(shield?.activation.type).toBe("reaction");
    expect(ampheryn.items.some((item) => item.name === "Perfect aim")).toBe(true);

    const assassin = npcToActorData(byName("Snake's Errant Assassin"), { ruleset: "2014", newId: sequenceIds("as") });
    const dagger = assassin.items.find((item) => item.name === "Shadow dagger");
    expect(activity(dagger!, "attack")?.damage?.parts[0]).toMatchObject({ number: 1, denomination: 4, bonus: "3" });
    const rider = activity(dagger!, "save");
    expect(rider?.save?.dc.formula).toBe("12");
    expect(rider?.save?.ability).toEqual(["wis"]);
    expect(rider?.damage?.onSave).toBe("half");
    expect(rider?.damage?.parts[0]?.types).toEqual(["necrotic"]);
    expect(assassin.system.details.alignment).toBe("lawful evil");
    const parry = assassin.items.find((item) => item.name === "Magical parry");
    expect(Object.values(parry!.system.activities)[0]?.activation.type).toBe("reaction");

    const doppelganger = npcToActorData(byName("Doppelganger"), { ruleset: "2014", newId: sequenceIds("dg") });
    expect(doppelganger.system.attributes.ac.flat).toBe(11);
    expect(doppelganger.system.attributes.hp).toMatchObject({ value: 20, max: 20, formula: "2d8+10" });
    expect(activity(doppelganger.items.find((item) => item.name === "Stab")!, "attack")?.attack?.bonus).toBe("+7");
    expect(doppelganger.system.traits.dv.custom.toLowerCase()).toContain("silver");
  });

  it("prefers the printed AC when the model disagrees", () => {
    const text = [
      "Example Crab",
      "Small beast, unaligned",
      "Armor Class 13 (natural armor)",
      "Hit Points 2 (1d6-1)",
      "Speed 20 ft., swim 20 ft.",
      "STR DEX CON INT WIS CHA",
      "2 (-4) 11 (+0) 10 (+0) 1 (-5) 8 (-1) 2 (-4)",
      "Skills Stealth +2",
      "Senses blindsight 30 ft., passive Perception 9",
      "Languages —",
      "Challenge 0 (10 XP)",
      "Actions",
      "Pinch. Melee Weapon Attack: +0 to hit, reach 5 ft., one target. Hit: 1 (1d4-1) bludgeoning damage.",
    ].join("\n");
    const parsed = fallbackNpcFromStatBlock("Example Crab", text);
    expect(parsed.cr).toBe(0);
    expect(parsed.speed?.swim).toBe("20");
    expect(parsed.skills?.stealth).toBe(2);
    expect(parsed.senses?.blindsight).toBe(30);
    expect(parsed.size).toBe("sm");

    const reconciled = reconcileNpc({ ...parsed, ac: 18, cr: 5 }, text);
    expect(reconciled.npc.ac).toBe(13);
    expect(reconciled.npc.cr).toBe(0);
    expect(reconciled.notes.some((note) => note.includes("AC"))).toBe(true);

    const actor = npcToActorData(parsed, { ruleset: "2024", newId: sequenceIds("cr") });
    expect(actor.system.skills.ste.value).toBe(1);
    expect(skillFromPrintedBonus(5, 16, 1)).toEqual({ value: 1 });
    expect(skillFromPrintedBonus(7, 16, 1).value).toBe(2);
  });

  it("copies an SRD actor and records the compendium source", () => {
    const source = {
      uuid: "Compendium.dnd5e.monsters.Actor.goblin",
      toObject: () => ({
        _id: "goblin",
        name: "Goblin",
        system: {
          attributes: { ac: { flat: 15, calc: "default" }, hp: { value: 7, max: 7 } },
          details: { cr: 0.25 },
        },
      }),
    };
    expect(readCreatureStats(source.toObject().system)).toEqual({ ac: 15, hp: 7, cr: 0.25 });
    const copied = actorDataFromSrd(source, {
      folderId: "folder1",
      importId: "import1",
      moduleId: "folio",
      name: "Goblin",
      npc: {
        name: "Goblin",
        ac: 13,
        hp: 12,
        abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      },
      changed: true,
    });
    expect(copied._id).toBeUndefined();
    expect((copied._stats as { compendiumSource: string }).compendiumSource).toBe(source.uuid);
    expect((copied.flags as { folio: { match: string } }).folio.match).toBe("srd-changed");
    const system = copied.system as { attributes: { ac: { flat: number; calc: string }; hp: { max: number } } };
    expect(system.attributes.ac).toMatchObject({ flat: 13, calc: "flat" });
    expect(system.attributes.hp.max).toBe(12);
  });
});

describe("journal html", () => {
  it("escapes text, styles read-aloud, and leaves actor placeholders", () => {
    const html = renderSectionHtml({
      title: "Scene <1>",
      paragraphs: [
        { text: "Ampheryn says <script>.", readAloud: false },
        { text: "You see Ampheryn.", readAloud: true },
      ],
    }, [{ id: "ampheryn", name: "Ampheryn" }]);
    expect(html).toContain("<h2>Scene &lt;1&gt;</h2>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("folio-read-aloud");
    expect(html).toContain("@@folio:ampheryn@@");
    const linked = applyActorLinks(html, [{ planId: "ampheryn", actorId: "abc", name: "Ampheryn" }]);
    expect(linked).toContain("@UUID[Actor.abc]{Ampheryn}");
    expect(linked).not.toContain("@@folio:");
  });
});
