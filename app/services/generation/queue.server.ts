import { Queue } from "bullmq";
import { MAX_RETRY_ATTEMPTS } from "~/lib/constants";
import { redis } from "~/services/redis.server";

const connection = redis.duplicate();

export const generationQueue = new Queue("generation", {
  connection,
  defaultJobOptions: {
    attempts: MAX_RETRY_ATTEMPTS,
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export type GenerationJobPayload = {
  jobId: string;
  shopId: string;
  templateType: string;
  prompt: string;
};

export async function addGenerationJob(jobId: string, data: GenerationJobPayload) {
  return generationQueue.add("generate", data, { jobId });
}
