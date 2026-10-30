import type { ImportPlan, PlanActor } from "./types.ts";

export function actorById(plan: ImportPlan, id: string): PlanActor | undefined {
  return plan.actors.find((actor) => actor.id === id);
}

export function renameActor(plan: ImportPlan, id: string, name: string): void {
  const actor = actorById(plan, id);
  const trimmed = name.trim();
  if (!actor || !trimmed) return;
  actor.npc = { ...actor.npc, name: trimmed };
}

export function setActorIncluded(plan: ImportPlan, id: string, include: boolean): void {
  const actor = actorById(plan, id);
  if (actor) actor.include = include;
}

export function setActorSource(plan: ImportPlan, id: string, source: PlanActor["source"]): void {
  const actor = actorById(plan, id);
  if (!actor || (source === "srd" && !actor.srd)) return;
  actor.source = source;
}

export function setActorNumbers(plan: ImportPlan, id: string, numbers: { ac?: number; hp?: number; cr?: number | null }): void {
  const actor = actorById(plan, id);
  if (!actor) return;
  if (numbers.ac != null && Number.isFinite(numbers.ac)) actor.npc = { ...actor.npc, ac: numbers.ac };
  if (numbers.hp != null && Number.isFinite(numbers.hp)) actor.npc = { ...actor.npc, hp: numbers.hp };
  if (numbers.cr === null) {
    const next = { ...actor.npc };
    delete next.cr;
    actor.npc = next;
  } else if (numbers.cr != null && Number.isFinite(numbers.cr)) {
    actor.npc = { ...actor.npc, cr: numbers.cr };
  }
}

export function setSectionIncluded(plan: ImportPlan, chapterId: string, sectionId: string, include: boolean): void {
  const section = findSection(plan, chapterId, sectionId);
  if (section) section.include = include;
}

export function renameSection(plan: ImportPlan, chapterId: string, sectionId: string, title: string): void {
  const section = findSection(plan, chapterId, sectionId);
  const trimmed = title.trim();
  if (section && trimmed) section.title = trimmed;
}

/** Fold this section's paragraphs into the previous section in the same chapter. */
export function mergeSectionUp(plan: ImportPlan, chapterId: string, sectionId: string): void {
  const chapter = plan.chapters.find((entry) => entry.id === chapterId);
  if (!chapter) return;
  const index = chapter.sections.findIndex((section) => section.id === sectionId);
  if (index <= 0) return;
  const previous = chapter.sections[index - 1];
  const current = chapter.sections[index];
  if (!previous || !current) return;
  previous.paragraphs.push(...current.paragraphs);
  previous.sourcePages = [...new Set([...previous.sourcePages, ...current.sourcePages])];
  chapter.sections.splice(index, 1);
}

function findSection(plan: ImportPlan, chapterId: string, sectionId: string) {
  return plan.chapters.find((chapter) => chapter.id === chapterId)?.sections.find((section) => section.id === sectionId);
}
