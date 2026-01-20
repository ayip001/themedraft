import crypto from "node:crypto";

export type GenerationInput = {
  templateType: string;
  prompt: string;
  idempotencyKey?: string | null;
};

export function generateInputHash(shopId: string, input: GenerationInput) {
  const hash = crypto.createHash("sha256");
  hash.update(shopId);
  hash.update("|");
  hash.update(input.templateType);
  hash.update("|");
  hash.update(input.prompt);
  return hash.digest("hex");
}

export function resolveIdempotencyKey(
  shopId: string,
  input: GenerationInput,
): string {
  return input.idempotencyKey?.trim() || generateInputHash(shopId, input);
}
