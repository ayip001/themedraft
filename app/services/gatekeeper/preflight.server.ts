import { prisma } from "~/services/db.server";
import {
  BYPASS_LIMITS_SHOP,
  DAILY_SPEND_CAP_USD,
} from "~/lib/constants";
import { checkRateLimit } from "~/services/gatekeeper/rate-limiter.server";
import {
  type GenerationInput,
  resolveIdempotencyKey,
} from "~/services/gatekeeper/idempotency.server";

export type PreflightResult =
  | {
      allowed: false;
      error:
        | "RATE_LIMITED"
        | "CREDITS_EXHAUSTED"
        | "DAILY_CAP_REACHED";
      retryAfter?: number;
    }
  | {
      allowed: true;
      existingJobId?: string;
      idempotencyKey?: string;
    };

export async function runPreflightChecks(
  shopId: string,
  input: GenerationInput,
): Promise<PreflightResult> {
  const rateLimit = await checkRateLimit(shopId);
  if (!rateLimit.allowed) {
    return {
      allowed: false,
      error: "RATE_LIMITED",
      retryAfter: rateLimit.retryAfter,
    };
  }

  const idempotencyKey = resolveIdempotencyKey(shopId, input);
  const existingJob = await prisma.generationJob.findUnique({
    where: { idempotencyKey },
  });

  if (existingJob) {
    return { allowed: true, existingJobId: existingJob.id };
  }

  if (shopId === BYPASS_LIMITS_SHOP) {
    return { allowed: true, idempotencyKey };
  }

  const quota = await prisma.quota.findUnique({ where: { shopId } });
  if (quota && quota.creditsUsed >= quota.creditsLimit) {
    return { allowed: false, error: "CREDITS_EXHAUSTED" };
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const spend = await prisma.usageLog.aggregate({
    where: {
      shopId,
      createdAt: {
        gte: startOfDay,
      },
    },
    _sum: { estimatedCostUsd: true },
  });

  const todaySpend = spend._sum.estimatedCostUsd ?? 0;
  const maxDailySpend = quota?.maxDailySpendUsd ?? DAILY_SPEND_CAP_USD;

  if (todaySpend >= maxDailySpend) {
    return { allowed: false, error: "DAILY_CAP_REACHED" };
  }

  return {
    allowed: true,
    idempotencyKey,
  };
}
