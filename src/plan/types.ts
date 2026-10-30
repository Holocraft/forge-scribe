import type { Ruleset } from "../constants.ts";
import type { NpcDraft } from "../llm/schema.ts";

export interface PlanParagraph {
  text: string;
  readAloud: boolean;
}

export interface PlanSection {
  id: string;
  title: string;
  include: boolean;
  sourcePages: number[];
  paragraphs: PlanParagraph[];
  statBlockId?: string;
}

export interface PlanChapter {
  id: string;
  title: string;
  include: boolean;
  sections: PlanSection[];
}

export type ActorMatch = "custom" | "srd" | "srd-changed";
export type ActorSource = "custom" | "srd";

export interface PlanActor {
  id: string;
  include: boolean;
  /** How the review screen should build this actor. The GM can switch it. */
  source: ActorSource;
  match: ActorMatch;
  notes: string[];
  /** Filled in when a compendium is available. Separate from parse notes so rematch can replace them. */
  srdNotes: string[];
  npc: NpcDraft;
  sourcePage?: number;
  statBlockText?: string;
  srd?: { packId: string; documentId: string; name: string; uuid: string };
}

export interface ImportPlan {
  title: string;
  ruleset: Ruleset;
  warnings: string[];
  usedAi: boolean;
  chapters: PlanChapter[];
  actors: PlanActor[];
}
