function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const DATABASE_URL = requireEnv("DATABASE_URL");
export const REDIS_URL = requireEnv("REDIS_URL");
export const ADMIN_SECRET = requireEnv("ADMIN_SECRET");

export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
export const OPENROUTER_DEFAULT_MODEL =
  process.env.OPENROUTER_DEFAULT_MODEL ??
  "google/gemini-2.0-flash-exp:free";

export const DAILY_SPEND_CAP_USD = parseNumber(
  process.env.DAILY_SPEND_CAP_USD ?? "5.0",
  5.0,
);
export const DEFAULT_CREDITS_LIMIT = parseNumber(
  process.env.DEFAULT_CREDITS_LIMIT ?? "10",
  10,
);
export const RATE_LIMIT_PER_MINUTE = parseNumber(
  process.env.RATE_LIMIT_PER_MINUTE ?? "5",
  5,
);
export const MAX_RETRY_ATTEMPTS = parseNumber(
  process.env.MAX_RETRY_ATTEMPTS ?? "3",
  3,
);

export const WRITE_TO_ACTIVE_THEME =
  process.env.WRITE_TO_ACTIVE_THEME === "true";
export const BYPASS_LIMITS_SHOP = process.env.BYPASS_LIMITS_SHOP ?? "";
