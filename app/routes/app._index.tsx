import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { Card, Page, DataTable, Button, Text } from "@shopify/polaris";
import { prisma, requireShopId } from "~/services/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shopId = await requireShopId(request);

  const jobs = await prisma.generationJob.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return json({
    jobs: jobs.map((job) => ({
      id: job.id,
      templateType: job.templateType,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
    })),
    shopId,
  });
}

export default function Dashboard() {
  const { jobs, shopId } = useLoaderData<typeof loader>();

  const rows = jobs.map((job) => [
    job.templateType,
    job.status,
    new Date(job.createdAt).toLocaleString(),
  ]);

  return (
    <Page
      title="ThemeDraft"
      primaryAction={{
        content: "Create Template",
        url: `/app/create?shop=${shopId}`,
      }}
    >
      <Card>
        {rows.length > 0 ? (
          <DataTable
            columnContentTypes={["text", "text", "text"]}
            headings={["Template", "Status", "Created"]}
            rows={rows}
          />
        ) : (
          <Text as="p" variant="bodyMd">
            No jobs yet. <Link to={`/app/create?shop=${shopId}`}>Create one</Link>.
          </Text>
        )}
      </Card>
      <div style={{ marginTop: 16 }}>
        <Button url={`/app/create?shop=${shopId}`}>Start a new generation</Button>
      </div>
    </Page>
  );
}
