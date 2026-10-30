import type { Ruleset } from "../constants.ts";
import { SRD_PACKS } from "../constants.ts";
import type { LlmClient } from "../llm/run.ts";
import { completeValidated } from "../llm/run.ts";
import { formatProse, MAX_AI_CHUNKS, splitProse } from "../llm/prose.ts";
import { NPC_SYSTEM_PROMPT, STRUCTURE_SYSTEM_PROMPT, npcUserPrompt, structureUserPrompt } from "../llm/prompts.ts";
import { npcSchema, outlineSchema, type NpcDraft, type OutlineDraft } from "../llm/schema.ts";
import { fallbackNpcFromStatBlock, StatBlockParseError } from "../mapping/stat-parse.ts";
import { reconcileNpc } from "../mapping/reconcile.ts";
import { slugId } from "../pdf/statblocks.ts";
import type { ExtractedDocument, ProseParagraph } from "../pdf/types.ts";
import type { ImportPlan, PlanActor, PlanChapter, PlanSection } from "./types.ts";

/**
 * Turn extracted pages into the review-screen plan.
 * With no client (or after a failed model call) the headings and the
 * deterministic stat-block parser are enough to import. The model is an
 * upgrade for read-aloud detection and messy traits, not a requirement.
 */

export async function buildImportPlan(options: {
  extracted: ExtractedDocument;
  ruleset: Ruleset;
  client: LlmClient | null;
}): Promise<ImportPlan> {
  const warnings = [...options.extracted.warnings];
  let outline = outlineFromExtraction(options.extracted);
  let usedAi = false;

  if (options.client) {
    const prose = formatProse(options.extracted);
    const chunks = splitProse(prose);
    if (chunks.length > MAX_AI_CHUNKS) {
      warnings.push(
        `This page range would take about ${chunks.length} structure requests. Narrow the range. Showing the heading outline instead.`,
      );
    } else {
      const structured = await structureChunks(options.client, chunks, options.extracted);
      if (structured.ok) {
        outline = structured.outline;
        usedAi = true;
        warnings.push(...structured.warnings);
      } else {
        warnings.push(`AI structure failed (${structured.error}). Using headings from the PDF instead.`);
      }
    }
  }

  const known = new Set(options.extracted.statBlocks.map((block) => block.id));
  outline = attachMissingCreatures(outline, options.extracted, known);
  const actors: PlanActor[] = [];
  for (const block of options.extracted.statBlocks) {
    const built = await actorFromBlock(block, options.client);
    warnings.push(...built.warnings);
    actors.push({
      id: block.id,
      include: true,
      source: "custom",
      match: "custom",
      notes: built.notes,
      srdNotes: [],
      npc: built.npc,
      sourcePage: block.page,
      statBlockText: block.text,
    });
  }

  return {
    title: outline.title || options.extracted.title,
    ruleset: options.ruleset,
    warnings,
    usedAi,
    chapters: assignIds(outline.chapters),
    actors,
  };
}

export function outlineFromExtraction(extracted: ExtractedDocument): OutlineDraft {
  type Chapter = OutlineDraft["chapters"][number];
  type Section = Chapter["sections"][number];
  const chapters: Chapter[] = [];
  let chapter: Chapter | undefined;
  let section: Section | undefined;

  const makeChapter = (title: string): Chapter => {
    const created: Chapter = { title, sections: [] };
    chapters.push(created);
    return created;
  };
  const makeSection = (current: Chapter, title: string, page: number): Section => {
    const created: Section = { title, sourcePages: [page], paragraphs: [] };
    current.sections.push(created);
    return created;
  };

  for (const paragraph of extracted.paragraphs) {
    if (paragraph.role === "title") continue;
    if (paragraph.role === "heading") {
      chapter = makeChapter(paragraph.text);
      section = makeSection(chapter, paragraph.text, paragraph.page);
      continue;
    }
    if (paragraph.role === "subheading") {
      chapter ??= makeChapter("Overview");
      section = makeSection(chapter, paragraph.text, paragraph.page);
      continue;
    }
    chapter ??= makeChapter("Overview");
    section ??= makeSection(chapter, chapter.title, paragraph.page);
    const pages = section.sourcePages ?? [];
    section.sourcePages = pages;
    if (!pages.includes(paragraph.page)) pages.push(paragraph.page);
    section.paragraphs.push({ text: paragraph.text, readAloud: paragraph.readAloud });
  }

  const usable = chapters.filter((entry) => entry.sections.some((part) => part.paragraphs.length > 0 || part.statBlockId));
  if (usable.length === 0) {
    return {
      title: extracted.title,
      chapters: [{
        title: extracted.title,
        sections: [{ title: extracted.title, sourcePages: [1], paragraphs: paragraphsOf(extracted.paragraphs) }],
      }],
    };
  }
  return { title: extracted.title, chapters: usable };
}

function paragraphsOf(paragraphs: ProseParagraph[]): { text: string; readAloud: boolean }[] {
  return paragraphs
    .filter((paragraph) => paragraph.role === "body")
    .map((paragraph) => ({ text: paragraph.text, readAloud: paragraph.readAloud }));
}

async function structureChunks(
  client: LlmClient,
  chunks: string[],
  extracted: ExtractedDocument,
): Promise<{ ok: true; outline: OutlineDraft; warnings: string[] } | { ok: false; error: string }> {
  const warnings: string[] = [];
  const parts: OutlineDraft[] = [];
  for (const chunk of chunks) {
    const result = await completeValidated(
      client,
      outlineSchema,
      STRUCTURE_SYSTEM_PROMPT,
      structureUserPrompt(chunk, extracted.statBlocks),
    );
    if (!result.ok) return result;
    parts.push(result.value);
  }
  return { ok: true, outline: mergeOutlines(parts, extracted.statBlocks.map((block) => block.id), warnings), warnings };
}

function mergeOutlines(parts: OutlineDraft[], knownIds: string[], warnings: string[]): OutlineDraft {
  const merged: OutlineDraft["chapters"] = [];
  for (const part of parts) {
    for (const chapter of part.chapters) {
      const sections = chapter.sections.map((section) => {
        if (section.statBlockId && !knownIds.includes(section.statBlockId)) {
          warnings.push(`Dropped unknown stat block id “${section.statBlockId}”.`);
          const rest = { ...section };
          delete rest.statBlockId;
          return rest;
        }
        return section;
      });
      const previous = merged[merged.length - 1];
      if (previous && previous.title.toLowerCase() === chapter.title.toLowerCase()) previous.sections.push(...sections);
      else merged.push({ title: chapter.title, sections });
    }
  }
  return { title: parts[0]?.title ?? "Imported adventure", chapters: merged };
}

function attachMissingCreatures(outline: OutlineDraft, extracted: ExtractedDocument, known: Set<string>): OutlineDraft {
  const referenced = new Set(
    outline.chapters.flatMap((chapter) => chapter.sections.map((section) => section.statBlockId).filter((id): id is string => Boolean(id))),
  );
  const missing = extracted.statBlocks.filter((block) => known.has(block.id) && !referenced.has(block.id));
  if (missing.length === 0) return outline;
  return {
    ...outline,
    chapters: [
      ...outline.chapters,
      {
        title: "Creatures",
        sections: missing.map((block) => ({
          title: block.name,
          sourcePages: [block.page],
          paragraphs: [{ text: `${block.name} is imported as an actor.`, readAloud: false }],
          statBlockId: block.id,
        })),
      },
    ],
  };
}

async function actorFromBlock(
  block: { id: string; name: string; text: string },
  client: LlmClient | null,
): Promise<{ npc: NpcDraft; notes: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  let draft: NpcDraft | null = null;
  if (client) {
    const result = await completeValidated(client, npcSchema, NPC_SYSTEM_PROMPT, npcUserPrompt(block.name, block.text));
    if (result.ok) draft = { ...result.value, name: block.name };
    else warnings.push(`${block.name}: the model response was rejected (${result.error}). Using the printed numbers instead.`);
  }
  if (!draft) {
    try {
      draft = fallbackNpcFromStatBlock(block.name, block.text);
    } catch (error) {
      const message = error instanceof StatBlockParseError ? error.message : "Could not parse this stat block.";
      warnings.push(message);
      draft = {
        name: block.name,
        ac: 10,
        hp: 1,
        abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        biography: block.text.slice(0, 1500),
      };
    }
  }
  const reconciled = reconcileNpc(draft, block.text);
  return { npc: reconciled.npc, notes: reconciled.notes, warnings };
}

function assignIds(chapters: OutlineDraft["chapters"]): PlanChapter[] {
  const used = new Set<string>();
  const take = (title: string) => {
    const base = slugId(title) || "section";
    let id = base;
    let n = 2;
    while (used.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    used.add(id);
    return id;
  };
  return chapters.map((chapter) => ({
    id: take(chapter.title),
    title: chapter.title,
    include: true,
    sections: chapter.sections.map((section): PlanSection => ({
      id: take(section.title),
      title: section.title,
      include: true,
      sourcePages: section.sourcePages ?? [],
      paragraphs: section.paragraphs.map((paragraph) => ({ ...paragraph })),
      ...(section.statBlockId ? { statBlockId: section.statBlockId } : {}),
    })),
  }));
}

export function srdPackId(ruleset: Ruleset): string {
  return SRD_PACKS[ruleset].actors;
}
