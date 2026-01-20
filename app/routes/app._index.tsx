import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  DataTable,
  EmptyState,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "~/shopify.server";
import prisma from "~/services/db.server";

const statusToneMap: Record<string, "info" | "success" | "critical" | "warning"> = {
  PENDING: "info",
  PROCESSING: "info",
  VALIDATING: "warning",
  WRITING: "warning",
  COMPLETED: "success",
  FAILED: "critical",
  CANCELLED: "critical",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const jobs = await prisma.generationJob.findMany({
    where: { shopId: session.shop },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return { jobs };
};

export default function Dashboard() {
  const { jobs } = useLoaderData<typeof loader>();

  const rows = jobs.map((job) => [
    job.templateType,
    <Badge key={job.id} tone={statusToneMap[job.status]}>
      {job.status}
    </Badge>,
    new Date(job.createdAt).toLocaleString(),
  ]);

  return (
    <Page>
      <TitleBar title="ThemeDraft Dashboard" />
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text as="h2" variant="headingMd">
            Recent generation jobs
          </Text>
          <Button variant="primary" url="/app/create">
            Create template
          </Button>
        </InlineStack>
        <Card>
          {jobs.length === 0 ? (
            <EmptyState
              heading="No jobs yet"
              action={{ content: "Create your first template", url: "/app/create" }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Submit a prompt to generate your first template.</p>
            </EmptyState>
          ) : (
            <DataTable
              columnContentTypes={["text", "text", "text"]}
              headings={["Template type", "Status", "Created"]}
              rows={rows}
            />
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
