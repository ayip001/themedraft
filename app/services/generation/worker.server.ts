import { Job, Worker } from "bullmq";
import pkg from "@prisma/client";
const { JobStatus } = pkg;
import {
  MAX_RETRY_ATTEMPTS,
  OPENROUTER_DEFAULT_MODEL,
} from "~/lib/constants";
import prisma, { ensureQuota } from "~/services/db.server";
import { redisClient } from "~/services/redis.server";
import { generateTemplate } from "~/services/ai/openrouter.server";
import { calculateCost, type ModelId } from "~/services/ai/models.server";
import {
  publishJobUpdate,
  type JobProgressEvent,
} from "~/services/generation/publisher.server";
import type { GenerationJobPayload } from "~/services/generation/queue.server";

let workerInstance: Worker<GenerationJobPayload> | null = null;

async function updateStatus(
  jobId: string,
  status: JobStatus,
  payload?: JobProgressEvent,
) {
  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status },
  });

  if (payload) {
    await publishJobUpdate(jobId, payload);
  }
}

export function startGenerationWorker() {
  if (workerInstance) {
    return workerInstance;
  }

  workerInstance = new Worker<GenerationJobPayload>(
    "generation",
    async (job: Job<GenerationJobPayload>) => {
      const { jobId, shopId, templateType, prompt } = job.data;

      try {
        await prisma.generationJob.update({
          where: { id: jobId },
          data: { status: JobStatus.PROCESSING, startedAt: new Date() },
        });
        await publishJobUpdate(jobId, {
          status: "processing",
          message: "Starting generation",
        });

        const result = await generateTemplate(prompt, OPENROUTER_DEFAULT_MODEL);
        await updateStatus(jobId, JobStatus.VALIDATING, {
          status: "validating",
          message: "Validating JSON",
        });

        await updateStatus(jobId, JobStatus.WRITING, {
          status: "writing",
          message: "Writing template",
        });

        const parsedResult = JSON.parse(result.content);
        const modelId = result.model as ModelId;
        const cost = calculateCost(
          modelId,
          result.usage.inputTokens,
          result.usage.outputTokens,
        );

        await ensureQuota(shopId);

        await prisma.$transaction(async (tx) => {
          await tx.generationJob.update({
            where: { id: jobId },
            data: {
              status: JobStatus.COMPLETED,
              completedAt: new Date(),
              result: parsedResult,
              errorMessage: null,
            },
          });

          await tx.usageLog.create({
            data: {
              jobId,
              shopId,
              action: "GENERATE_TEMPLATE",
              status: "SUCCESS",
              templateType,
              model: result.model,
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              estimatedCostUsd: cost,
            },
          });

          await tx.quota.update({
            where: { shopId },
            data: { creditsUsed: { increment: 1 } },
          });
        });

        await publishJobUpdate(jobId, {
          status: "completed",
          message: "Generation complete",
          result: parsedResult,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        const retryCount = job.attemptsMade + 1;

        await prisma.generationJob.update({
          where: { id: jobId },
          data: {
            retryCount,
            status:
              retryCount >= MAX_RETRY_ATTEMPTS
                ? JobStatus.FAILED
                : JobStatus.PENDING,
            errorMessage: message,
          },
        });

        await publishJobUpdate(jobId, {
          status: retryCount >= MAX_RETRY_ATTEMPTS ? "failed" : "warning",
          error: message,
          message:
            retryCount >= MAX_RETRY_ATTEMPTS
              ? "Job failed"
              : `Retrying attempt ${retryCount}`,
        });

        throw error;
      }
    },
    {
      connection: redisClient,
    },
  );

  workerInstance.on("failed", async (job, error) => {
    if (!job) return;
    const message = error instanceof Error ? error.message : "Worker failed";
    await publishJobUpdate(job.data.jobId, {
      status: "failed",
      error: message,
      message: "Job failed",
    });
  });

  return workerInstance;
}
