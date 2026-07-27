/** Client catalog of models Atlas can select in the composer. */

export const EFFORT_LEVELS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "max", label: "Max" },
] as const;

export type EffortId = (typeof EFFORT_LEVELS)[number]["id"];

export const AI_MODELS = [
  {
    id: "auto",
    label: "Auto",
    description: "Best available for the job",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    description: "OpenAI",
  },
  {
    id: "claude-sonnet",
    label: "Claude Sonnet",
    description: "Anthropic",
  },
] as const;

export type ModelId = (typeof AI_MODELS)[number]["id"];

export function isModelId(value: string): value is ModelId {
  return AI_MODELS.some((m) => m.id === value);
}

export function isEffortId(value: string): value is EffortId {
  return EFFORT_LEVELS.some((e) => e.id === value);
}
