import { Queue } from "bullmq";
import { redisClient } from "~/services/redis.server";
import { MAX_RETRY_ATTEMPTS } from "~/lib/constants";

export type GenerationJobPayload = {
  jobId: string;
  shopId: string;
  templateType: string;
  prompt: string;
  idempotencyKey: string;
};

export const generationQueue = new Queue<GenerationJobPayload>("generation", {
  connection: redisClient,
});

export async function addGenerationJob(
  jobId: string,
  data: GenerationJobPayload,
) {
  return generationQueue.add(jobId, data, {
    attempts: MAX_RETRY_ATTEMPTS,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}
