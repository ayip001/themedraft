import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "~/services/db.server";
import { redisSubscriber } from "~/services/redis.server";
import { publishJobEvent } from "~/services/generation/publisher.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const jobId = params.jobId;
  if (!jobId) {
    throw new Response("Missing jobId", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const subscriber = redisSubscriber.duplicate();
      await subscriber.subscribe(`job:${jobId}`);

      const send = (payload: string) => {
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      };

      subscriber.on("message", (_channel, message) => {
        send(message);
        try {
          const parsed = JSON.parse(message);
          if (
            ["completed", "failed", "cancelled"].includes(parsed.status)
          ) {
            subscriber.unsubscribe();
            subscriber.disconnect();
            controller.close();
          }
        } catch {
          // ignore parse errors
        }
      });

      request.signal.addEventListener("abort", async () => {
        await subscriber.unsubscribe();
        subscriber.disconnect();
        controller.close();

        const job = await prisma.generationJob.findUnique({
          where: { id: jobId },
        });

        if (job && ["PENDING", "PROCESSING", "VALIDATING", "WRITING"].includes(job.status)) {
          await prisma.generationJob.update({
            where: { id: jobId },
            data: { status: "CANCELLED", completedAt: new Date() },
          });
          await publishJobEvent(jobId, {
            status: "cancelled",
            message: "Client disconnected.",
          });
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
