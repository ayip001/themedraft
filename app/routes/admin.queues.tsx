import type { LoaderFunctionArgs } from "@remix-run/node";
import { ADMIN_SECRET } from "~/lib/constants";
import { generationQueue } from "~/services/generation/queue.server";

function renderHtml(content: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ThemeDraft Queues</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border-bottom: 1px solid #e1e1e1; padding: 0.5rem; text-align: left; }
      th { background: #f6f6f7; }
      code { background: #f4f4f5; padding: 0.1rem 0.3rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    ${content}
  </body>
</html>`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
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
  const recentJobs = await generationQueue.getJobs(
    ["waiting", "active", "completed", "failed", "delayed"],
    0,
    20,
    true,
  );

  const rows = recentJobs
    .map((job) => {
      return `<tr>
        <td><code>${job.id}</code></td>
        <td>${job.name}</td>
        <td>${job.data.templateType}</td>
        <td>${job.data.shopId}</td>
        <td>${job.attemptsMade}/${job.opts.attempts ?? 1}</td>
        <td>${job.finishedOn ? new Date(job.finishedOn).toLocaleString() : "-"}</td>
      </tr>`;
    })
    .join("");

  const html = renderHtml(`
    <h1>ThemeDraft Queue Dashboard</h1>
    <p>This lightweight view provides the same queue visibility expected from Bull Board.</p>
    <h2>Generation queue</h2>
    <ul>
      <li>Waiting: ${counts.waiting}</li>
      <li>Active: ${counts.active}</li>
      <li>Completed: ${counts.completed}</li>
      <li>Failed: ${counts.failed}</li>
      <li>Delayed: ${counts.delayed}</li>
    </ul>
    <h3>Recent jobs</h3>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Template</th>
          <th>Shop</th>
          <th>Attempts</th>
          <th>Finished</th>
        </tr>
      </thead>
      <tbody>
        ${rows || "<tr><td colspan=\"6\">No jobs yet.</td></tr>"}
      </tbody>
    </table>
  `);

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
