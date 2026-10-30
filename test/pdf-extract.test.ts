import { describe, expect, it } from "vitest";
import { joinHyphenBreak, normalizeNumericDashes, normalizeSpaces } from "../src/pdf/cleanup.ts";
import { columnBoundary, linesFromPage } from "../src/pdf/columns.ts";
import { extractDocument } from "../src/pdf/extract.ts";
import type { RawItem, RawPage } from "../src/pdf/types.ts";
import { loadHuntedQueen } from "./helpers/pdf.ts";

function item(str: string, x: number, y: number, height = 9): RawItem {
  return { str, x, y, width: str.length * height * 0.5, height, fontName: "Body" };
}

describe("text cleanup", () => {
  it("joins a line-break hyphen and keeps a compound hyphen", () => {
    expect(joinHyphenBreak("the common people were adven-", "ture bound")).toBe("the common people were adventure bound");
    expect(joinHyphenBreak("and his 5-year-", "old son Dunc")).toBe("and his 5-year-old son Dunc");
    expect(joinHyphenBreak("no hyphen here", "next")).toBeNull();
    expect(joinHyphenBreak("ends-", "With a capital")).toBeNull();
  });

  it("normalizes spaces and numeric minus signs", () => {
    expect(normalizeSpaces("hit\u00a0points   12")).toBe("hit points 12");
    expect(normalizeNumericDashes("3 (\u22124) and 1\u20132")).toBe("3 (-4) and 1-2");
  });
});

describe("column order", () => {
  it("reads the left column before the right column", () => {
    const page: RawPage = {
      pageNumber: 1,
      width: 600,
      height: 800,
      items: [
        item("LEFT TOP", 40, 700),
        item("RIGHT TOP", 360, 700),
        item("LEFT BOTTOM", 40, 500),
        item("RIGHT BOTTOM", 360, 500),
      ],
    };
    expect(columnBoundary(page.items, page.width)).toBeGreaterThan(200);
    expect(linesFromPage(page).map((line) => line.text)).toEqual([
      "LEFT TOP",
      "LEFT BOTTOM",
      "RIGHT TOP",
      "RIGHT BOTTOM",
    ]);
  });

  it("keeps a single column in top-to-bottom order", () => {
    const page: RawPage = {
      pageNumber: 1,
      width: 600,
      height: 800,
      items: [item("Second", 40, 500), item("First", 40, 700)],
    };
    expect(columnBoundary(page.items, page.width)).toBeNull();
    expect(linesFromPage(page).map((line) => line.text)).toEqual(["First", "Second"]);
  });

  it("glues a drop cap onto the first line of the paragraph", () => {
    const page: RawPage = {
      pageNumber: 1,
      width: 600,
      height: 800,
      items: [
        item("Q", 40, 640, 70),
        item("ueen Kalia of Bragod", 120, 700, 9),
        item("was traveling.", 40, 688, 9),
      ],
    };
    const lines = linesFromPage(page).map((line) => line.text);
    expect(lines[0]).toBe("Queen Kalia of Bragod");
    expect(lines.some((line) => line === "Q")).toBe(false);
  });
});

describe("The Hunted Queen PDF", () => {
  it("rebuilds reading order, the drop cap, and four stat blocks", async () => {
    const extracted = extractDocument(await loadHuntedQueen());
    const prose = extracted.paragraphs.map((paragraph) => paragraph.text).join("\n");

    expect(extracted.title).toBe("The Hunted Queen");
    expect(prose).toContain("Queen Kalia of Bragod was married");
    expect(prose.indexOf("Scene 1: The ambush")).toBeLessThan(prose.indexOf("Scene 2: The desert oasis"));
    expect(prose.indexOf("Scene 2: The desert oasis")).toBeLessThan(prose.indexOf("Scene 3: The border town"));
    expect(prose.indexOf("Scene 3: The border town")).toBeLessThan(prose.indexOf("Scene 4: The mage"));
    expect(prose).toContain("5-year-old");
    expect(prose).not.toMatch(/^Q$/m);

    const letter = extracted.paragraphs.find((paragraph) => paragraph.text.includes("My queen, events have unfolded"));
    expect(letter?.readAloud).toBe(true);

    expect(extracted.statBlocks.map((block) => block.name)).toEqual([
      "Ampheryn",
      "Doppelganger",
      "Giant Blade Spider",
      "Snake's Errant Assassin",
    ]);

    const spider = extracted.statBlocks.find((block) => block.id === "giant-blade-spider");
    expect(spider?.text).toMatch(/Armor Class 13/);
    expect(spider?.text).toMatch(/Hit Points 20 \(4d8 \+ 2\)/);
    expect(spider?.text).toContain("STR DEX CON INT WIS CHA");
    expect(spider?.text).toMatch(/Stab\./);

    // Stat blocks are filed separately, not left in the scene prose.
    expect(prose).not.toContain("Armor Class 13");
    expect(extracted.sparsePages).toEqual([]);
    expect(extracted.warnings).toEqual([]);
  });
});
