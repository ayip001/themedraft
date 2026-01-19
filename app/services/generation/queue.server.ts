import { Queue } from "bullmq";
import IORedis from "ioredis";
import { MAX_RETRY_ATTEMPTS, REDIS_URL } from "~/lib/constants";

const connection = new IORedis(REDIS_URL);

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
