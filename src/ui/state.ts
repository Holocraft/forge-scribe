import type { Ruleset } from "../constants.ts";
import type { ProviderId } from "../llm/providers.ts";
import type { ImportPlan } from "../plan/types.ts";

export type WizardStep = "setup" | "confirm" | "working" | "review" | "done";

export interface ImportSummary {
  importId: string;
  title: string;
  journals: number;
  actors: number;
  adventurePack?: string;
  warnings: string[];
}

export interface WizardState {
  step: WizardStep;
  fileName: string;
  pageCount: number;
  pageStart: number;
  pageEnd: number;
  ruleset: Ruleset;
  provider: ProviderId;
  model: string;
  apiKey: string;
  ollamaUrl: string;
  useAi: boolean;
  exportAdventure: boolean;
  busy: boolean;
  status: string;
  error: string;
  requestEstimate: number;
  statBlockNames: string[];
  plan: ImportPlan | null;
  result: ImportSummary | null;
}

export function emptyState(partial: Partial<WizardState> = {}): WizardState {
  return {
    step: "setup",
    fileName: "",
    pageCount: 0,
    pageStart: 1,
    pageEnd: 1,
    ruleset: "2024",
    provider: "openai",
    model: "",
    apiKey: "",
    ollamaUrl: "http://127.0.0.1:11434",
    useAi: true,
    exportAdventure: false,
    busy: false,
    status: "",
    error: "",
    requestEstimate: 0,
    statBlockNames: [],
    plan: null,
    result: null,
    ...partial,
  };
}
