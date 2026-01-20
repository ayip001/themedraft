import { redis } from "~/services/redis.server";

export type JobEventStatus =
  | "processing"
  | "validating"
  | "writing"
  | "completed"
  | "failed"
  | "cancelled"
  | "warning";

export type JobEventPayload = {
  status: JobEventStatus;
  message?: string;
  result?: unknown;
  error?: string;
};

export async function publishJobEvent(jobId: string, payload: JobEventPayload) {
  await redis.publish(`job:${jobId}`, JSON.stringify(payload));
}
