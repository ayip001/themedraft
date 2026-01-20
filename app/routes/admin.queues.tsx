import type { LoaderFunctionArgs } from "@remix-run/node";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { RequestHandler } from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { ADMIN_SECRET } from "~/lib/constants";
import { generationQueue } from "~/services/generation/queue.server";

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(generationQueue)],
  serverAdapter,
});

async function handleExpressRequest(
  request: Request,
  handler: RequestHandler,
): Promise<Response> {
  const url = new URL(request.url);
  const body = Buffer.from(await request.arrayBuffer());

  const socket = new Socket();
  const nodeRequest = new IncomingMessage(socket);
  nodeRequest.url = url.pathname + url.search;
  nodeRequest.method = request.method;
  nodeRequest.headers = Object.fromEntries(request.headers.entries());
  nodeRequest.push(body);
  nodeRequest.push(null);

  const nodeResponse = new ServerResponse(nodeRequest);
  const chunks: Buffer[] = [];

  nodeResponse.write = ((chunk: unknown) => {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return true;
  }) as ServerResponse["write"];

  nodeResponse.end = ((chunk?: unknown) => {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    nodeResponse.emit("finish");
    return nodeResponse;
  }) as ServerResponse["end"];

  return new Promise<Response>((resolve, reject) => {
    handler(nodeRequest, nodeResponse, (error) => {
      if (error) {
        reject(error);
      }
    });

    nodeResponse.on("finish", () => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(nodeResponse.getHeaders())) {
        if (typeof value === "string") {
          headers.set(key, value);
        } else if (Array.isArray(value)) {
          headers.set(key, value.join(", "));
        } else if (typeof value === "number") {
          headers.set(key, value.toString());
        }
      }

      resolve(
        new Response(Buffer.concat(chunks), {
          status: nodeResponse.statusCode,
          headers,
        }),
      );
    });
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (!secret || secret !== ADMIN_SECRET) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return handleExpressRequest(request, serverAdapter.getRouter());
}
