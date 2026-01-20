import {
  BYPASS_LIMITS_SHOP,
  DAILY_SPEND_CAP_USD,
} from "~/lib/constants";
import prisma, { ensureQuota } from "~/services/db.server";
import { resolveIdempotencyKey, type GenerationInput } from "./idempotency.server";
import { checkRateLimit } from "./rate-limiter.server";

type PreflightError =
  | "RATE_LIMITED"
  | "CREDITS_EXHAUSTED"
  | "DAILY_CAP_REACHED";

type PreflightResult =
  | {
      allowed: true;
      idempotencyKey: string;
      existingJobId?: string;
    }
  | {
      allowed: false;
      error: PreflightError;
      retryAfter?: number;
    };

export async function runPreflightChecks(
  shopId: string,
  input: GenerationInput,
): Promise<PreflightResult> {
  const rateLimitResult = await checkRateLimit(shopId);
  if (!rateLimitResult.allowed) {
    return {
      allowed: false,
      error: "RATE_LIMITED",
      retryAfter: rateLimitResult.retryAfter,
    };
  }

  if (BYPASS_LIMITS_SHOP && shopId === BYPASS_LIMITS_SHOP) {
    return {
      allowed: true,
      idempotencyKey: resolveIdempotencyKey(shopId, input),
    };
  }

  const quota = await ensureQuota(shopId);

  if (quota.creditsUsed >= quota.creditsLimit) {
    return { allowed: false, error: "CREDITS_EXHAUSTED" };
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todaySpend = await prisma.usageLog.aggregate({
    where: {
      shopId,
      createdAt: { gte: startOfDay },
    },
    _sum: {
      estimatedCostUsd: true,
    },
  });

  const maxDailySpend = quota.maxDailySpendUsd ?? DAILY_SPEND_CAP_USD;
  const spendSoFar = todaySpend._sum.estimatedCostUsd ?? 0;

  if (spendSoFar >= maxDailySpend) {
    return { allowed: false, error: "DAILY_CAP_REACHED" };
  }

  const idempotencyKey = resolveIdempotencyKey(shopId, input);
  const existingJob = await prisma.generationJob.findUnique({
    where: { idempotencyKey },
  });

  if (existingJob) {
    return {
      allowed: true,
      idempotencyKey,
      existingJobId: existingJob.id,
    };
  }

  return { allowed: true, idempotencyKey };
}
