import { OPENROUTER_API_KEY, OPENROUTER_DEFAULT_MODEL } from "~/lib/constants";

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
  console.log(`[OpenRouter] Starting generation with model: ${model}`);
  console.log(`[OpenRouter] Using API Key: ${OPENROUTER_API_KEY ? "PRESENT (Starts with " + OPENROUTER_API_KEY.substring(0, 7) + ")" : "MISSING"}`);

  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set.");
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/ayip001/themedraft",
        "X-Title": "ThemeDraft",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content:
              "You are a Shopify theme developer. Generate a liquid template or a JSON schema for a Shopify theme section. Return ONLY a valid JSON object with 'code' and 'filename' properties.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    console.log(`[OpenRouter] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[OpenRouter] Error body: ${errorBody}`);
      throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    console.log(`[OpenRouter] Successfully received data from model: ${data.model}`);
    const choice = data.choices[0];

    return {
      content: choice.message.content,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
      model: data.model,
    };
  } catch (error) {
    console.error("[OpenRouter] Fetch exception:", error);
    throw error;
  }
}
