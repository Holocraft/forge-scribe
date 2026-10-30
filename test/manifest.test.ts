import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { versionAtLeast } from "../src/version.ts";

describe("module.json", () => {
  const manifest = JSON.parse(readFileSync("module.json", "utf8")) as {
    id: string;
    description: string;
    compatibility: { minimum: string; verified: string };
    esmodules: string[];
    styles: string[];
    relationships: { systems: { id: string; compatibility: { minimum: string } }[] };
    packs?: unknown;
  };

  it("is a Foundry v14 module that requires dnd5e 6", () => {
    expect(manifest.id).toBe("folio");
    expect(manifest.compatibility.minimum).toBe("14");
    expect(manifest.compatibility.verified).toBe("14.369");
    expect(manifest.esmodules).toContain("dist/folio.js");
    expect(manifest.styles).toContain("dist/folio.css");
    expect(manifest.relationships.systems[0]?.id).toBe("dnd5e");
    expect(manifest.relationships.systems[0]?.compatibility.minimum).toBe("6.0.0");
    expect(manifest.packs).toBeUndefined();
    expect(manifest.description).toMatch(/PLACEHOLDER/);
  });
});

describe("versionAtLeast", () => {
  it("compares dotted versions", () => {
    expect(versionAtLeast("6.0.6", "6.0.0")).toBe(true);
    expect(versionAtLeast("6.0.0", "6.0.0")).toBe(true);
    expect(versionAtLeast("5.3.3", "6.0.0")).toBe(false);
    expect(versionAtLeast("14.369", "14")).toBe(true);
  });
});
