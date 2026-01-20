import type { LoaderFunctionArgs } from "@remix-run/node";
import { JobStatus } from "@prisma/client";
import { redisSubscriber } from "~/services/redis.server";
import prisma from "~/services/db.server";
import { publishJobUpdate } from "~/services/generation/publisher.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const jobId = params.jobId;

  if (!jobId) {
    throw new Response("Job ID is required", { status: 400 });
  }

  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job || job.shopId !== session.shop) {
    throw new Response("Not found", { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const subscriber = redisSubscriber.duplicate();

      const sendEvent = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      sendEvent({ status: job.status, message: "Connected" });

      await subscriber.subscribe(`job:${jobId}`);
      subscriber.on("message", (_channel, message) => {
        const payload = JSON.parse(message) as { status?: string };
        sendEvent(payload);
        if (
          payload.status &&
          ["completed", "failed", "cancelled"].includes(payload.status)
        ) {
          subscriber.unsubscribe(`job:${jobId}`).then(() => subscriber.disconnect());
          controller.close();
        }
      });

      request.signal.addEventListener("abort", async () => {
        await subscriber.unsubscribe(`job:${jobId}`);
        subscriber.disconnect();
        controller.close();

        const latest = await prisma.generationJob.findUnique({
          where: { id: jobId },
        });
        if (
          latest &&
          [
            JobStatus.PENDING,
            JobStatus.PROCESSING,
            JobStatus.VALIDATING,
            JobStatus.WRITING,
          ].includes(latest.status)
        ) {
          await prisma.generationJob.update({
            where: { id: jobId },
            data: { status: JobStatus.CANCELLED },
          });
          await publishJobUpdate(jobId, {
            status: "cancelled",
            message: "Cancelled by client",
          });
        }
      });
    },
    cancel() {
      return Promise.resolve();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
