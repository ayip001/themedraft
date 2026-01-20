import { OPENROUTER_DEFAULT_MODEL } from "~/lib/constants";

export type OpenRouterUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type OpenRouterResult = {
  content: string;
  usage: OpenRouterUsage;
  model: string;
};

export async function generateTemplate(
  prompt: string,
  model = OPENROUTER_DEFAULT_MODEL,
): Promise<OpenRouterResult> {
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    content: JSON.stringify({
      message: "Mock template generation",
      prompt,
      model,
    }),
    usage: {
      inputTokens: 120,
      outputTokens: 420,
    },
    model,
  };
}
