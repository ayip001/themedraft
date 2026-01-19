const requiredEnv = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "DATABASE_URL",
  "REDIS_URL",
  "ADMIN_SECRET",
];

export function validateEnv() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY ?? "";
export const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET ?? "";
export const DATABASE_URL = process.env.DATABASE_URL ?? "";
export const REDIS_URL = process.env.REDIS_URL ?? "";

export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
export const OPENROUTER_DEFAULT_MODEL =
  process.env.OPENROUTER_DEFAULT_MODEL ?? "google/gemini-2.0-flash-exp:free";

export const DAILY_SPEND_CAP_USD = Number.parseFloat(
  process.env.DAILY_SPEND_CAP_USD ?? "5.0",
);
export const DEFAULT_CREDITS_LIMIT = Number.parseInt(
  process.env.DEFAULT_CREDITS_LIMIT ?? "10",
  10,
);
export const RATE_LIMIT_PER_MINUTE = Number.parseInt(
  process.env.RATE_LIMIT_PER_MINUTE ?? "5",
  10,
);
export const MAX_RETRY_ATTEMPTS = Number.parseInt(
  process.env.MAX_RETRY_ATTEMPTS ?? "3",
  10,
);

export const WRITE_TO_ACTIVE_THEME = process.env.WRITE_TO_ACTIVE_THEME === "true";
export const BYPASS_LIMITS_SHOP = process.env.BYPASS_LIMITS_SHOP ?? "";

export const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
