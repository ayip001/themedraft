import crypto from "node:crypto";

export type GenerationInput = {
  templateType: string;
  prompt: string;
  idempotencyKey?: string | null;
};

export function generateInputHash(shopId: string, input: GenerationInput) {
  const hash = crypto
    .createHash("sha256")
    .update(`${shopId}:${input.templateType}:${input.prompt}`)
    .digest("hex");

  return `gen_${hash}`;
}

export function resolveIdempotencyKey(shopId: string, input: GenerationInput) {
  if (input.idempotencyKey) {
    return input.idempotencyKey;
  }

  return generateInputHash(shopId, input);
}
