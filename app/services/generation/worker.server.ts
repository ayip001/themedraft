import { Worker } from "bullmq";
import IORedis from "ioredis";
import { MAX_RETRY_ATTEMPTS, REDIS_URL } from "~/lib/constants";
import { prisma } from "~/services/db.server";
import { calculateCost } from "~/services/ai/models.server";
import { generateTemplate } from "~/services/ai/openrouter.server";
import { publishJobEvent } from "~/services/generation/publisher.server";
import type { GenerationJobPayload } from "~/services/generation/queue.server";

const connection = new IORedis(REDIS_URL);

export const generationWorker = new Worker<GenerationJobPayload>(
  "generation",
  async (job) => {
    const { jobId, shopId, templateType, prompt } = job.data;

    const currentJob = await prisma.generationJob.findUnique({
      where: { id: jobId },
    });

    if (!currentJob) {
      return;
    }

    if (currentJob.status === "CANCELLED") {
      await publishJobEvent(jobId, {
        status: "cancelled",
        message: "Job was cancelled before processing.",
      });
      return;
    }

    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "PROCESSING", startedAt: new Date() },
    });
    await publishJobEvent(jobId, { status: "processing" });

    try {
      const generation = await generateTemplate(prompt);

      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: "VALIDATING" },
      });
      await publishJobEvent(jobId, { status: "validating" });

      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: "WRITING" },
      });
      await publishJobEvent(jobId, { status: "writing" });

      const result = JSON.parse(generation.content);

      await prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          result,
          completedAt: new Date(),
        },
      });

      const estimatedCostUsd = calculateCost(
        generation.model,
        generation.usage.inputTokens,
        generation.usage.outputTokens,
      );

      await prisma.usageLog.create({
        data: {
          jobId,
          shopId,
          action: "GENERATE_TEMPLATE",
          status: "SUCCESS",
          templateType,
          model: generation.model,
          inputTokens: generation.usage.inputTokens,
          outputTokens: generation.usage.outputTokens,
          estimatedCostUsd,
        },
      });

      await prisma.quota.update({
        where: { shopId },
        data: { creditsUsed: { increment: 1 } },
      });

      await publishJobEvent(jobId, {
        status: "completed",
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const updatedJob = await prisma.generationJob.update({
        where: { id: jobId },
        data: {
          retryCount: { increment: 1 },
          errorMessage: message,
        },
      });

      if (updatedJob.retryCount >= MAX_RETRY_ATTEMPTS) {
        await prisma.generationJob.update({
          where: { id: jobId },
          data: { status: "FAILED", completedAt: new Date() },
        });
        await publishJobEvent(jobId, { status: "failed", error: message });
        return;
      }

      throw error;
    }
  },
  { connection },
);
