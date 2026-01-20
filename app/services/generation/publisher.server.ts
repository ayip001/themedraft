import { redisClient } from "~/services/redis.server";

type JobStatusEvent =
  | "queued"
  | "processing"
  | "validating"
  | "writing"
  | "completed"
  | "failed"
  | "cancelled"
  | "warning";

export type JobProgressEvent = {
  status: JobStatusEvent;
  message?: string;
  result?: unknown;
  error?: string;
};

export async function publishJobUpdate(
  jobId: string,
  payload: JobProgressEvent,
) {
  await redisClient.publish(`job:${jobId}`, JSON.stringify(payload));
}
