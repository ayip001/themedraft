import type { LoaderFunctionArgs } from "@remix-run/node";
import { ADMIN_SECRET } from "~/lib/constants";
import { generationQueue } from "~/services/generation/queue.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (!secret || secret !== ADMIN_SECRET) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const counts = await generationQueue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
  );

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ThemeDraft Queues</title>
  <style>
    body { font-family: sans-serif; padding: 24px; }
    h1 { margin-bottom: 12px; }
    ul { padding-left: 18px; }
  </style>
</head>
<body>
  <h1>Generation Queue</h1>
  <p>Basic queue stats (Bull Board UI can be layered on later).</p>
  <ul>
    <li>Waiting: ${counts.waiting}</li>
    <li>Active: ${counts.active}</li>
    <li>Completed: ${counts.completed}</li>
    <li>Failed: ${counts.failed}</li>
    <li>Delayed: ${counts.delayed}</li>
  </ul>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
    },
  });
}
