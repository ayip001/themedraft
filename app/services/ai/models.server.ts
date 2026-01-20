export const MODEL_REGISTRY = {
  "google/gemini-2.0-flash-exp:free": {
    id: "google/gemini-2.0-flash-exp:free",
    name: "Gemini 2.0 Flash (Free)",
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    tiers: ["FREE", "PRO", "AGENCY"],
  },
  "google/gemini-2.0-flash": {
    id: "google/gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.4,
    tiers: ["PRO", "AGENCY"],
  },
} as const;

export type ModelId = keyof typeof MODEL_REGISTRY;

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
) {
  const modelConfig = MODEL_REGISTRY[model as ModelId];
  if (!modelConfig) {
    return 0;
  }

  const inputCost =
    (inputTokens / 1_000_000) * modelConfig.inputPricePerMillion;
  const outputCost =
    (outputTokens / 1_000_000) * modelConfig.outputPricePerMillion;

  return inputCost + outputCost;
}
