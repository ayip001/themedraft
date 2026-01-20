import { OPENROUTER_DEFAULT_MODEL } from "~/lib/constants";

export type GenerationResult = {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateTemplate(
  prompt: string,
  model: string = OPENROUTER_DEFAULT_MODEL,
): Promise<GenerationResult> {
  await delay(2000);

  return {
    content: JSON.stringify({
      template: "mock",
      prompt,
      createdAt: new Date().toISOString(),
    }),
    usage: {
      inputTokens: 120,
      outputTokens: 240,
    },
    model,
  };
}
