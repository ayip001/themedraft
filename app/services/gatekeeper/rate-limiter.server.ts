import { RATE_LIMIT_PER_MINUTE } from "~/lib/constants";
import { redis } from "~/services/redis.server";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
};

export async function checkRateLimit(shopId: string): Promise<RateLimitResult> {
  const now = new Date();
  const minuteKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
  const key = `ratelimit:${shopId}:${minuteKey}`;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }

  if (count > RATE_LIMIT_PER_MINUTE) {
    const ttl = await redis.ttl(key);
    return {
      allowed: false,
      remaining: 0,
      retryAfter: ttl > 0 ? ttl : 60,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(RATE_LIMIT_PER_MINUTE - count, 0),
  };
}
