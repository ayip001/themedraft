import { RATE_LIMIT_PER_MINUTE } from "~/lib/constants";
import { redisClient } from "~/services/redis.server";

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
};

export async function checkRateLimit(shopId: string): Promise<RateLimitResult> {
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const key = `ratelimit:${shopId}:${minute}`;

  const multi = redisClient.multi();
  multi.incr(key);
  multi.expire(key, 60);
  const results = await multi.exec();

  const count = Number(results?.[0]?.[1] ?? 0);
  const remaining = Math.max(RATE_LIMIT_PER_MINUTE - count, 0);
  const allowed = count <= RATE_LIMIT_PER_MINUTE;

  if (!allowed) {
    const retryAfter = 60 - Math.floor((now % 60000) / 1000);
    return { allowed, remaining, retryAfter };
  }

  return { allowed, remaining };
}
