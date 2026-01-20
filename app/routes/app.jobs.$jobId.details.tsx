import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "~/shopify.server";
import prisma from "~/services/db.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const jobId = params.jobId;

  if (!jobId) {
    throw new Response("Job ID is required", { status: 400 });
  }

  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    include: { shop: true },
  });

  if (!job || job.shopId !== session.shop) {
    throw new Response("Not found", { status: 404 });
  }

  return json({ job });
};

export default function JobDetails() {
  const { job } = useLoaderData<typeof loader>();

  return (
    <Page backAction={{ content: "Dashboard", url: "/app" }}>
      <TitleBar title={`Job Details: ${job.templateType}`} />
      <BlockStack gap="400">
        {job.errorMessage && (
          <Banner tone="critical" title="Job Failed">
            <p>{job.errorMessage}</p>
          </Banner>
        )}
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Status
                  </Text>
                  <Badge tone={job.status === "COMPLETED" ? "success" : "info"}>
                    {job.status}
                  </Badge>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Prompt
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {job.prompt}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Result
                  </Text>
                  {job.result ? (
                    <Box
                      padding="400"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {JSON.stringify(job.result, null, 2)}
                      </pre>
                    </Box>
                  ) : (
                    <Text as="p" variant="bodyMd">
                      No result available yet.
                    </Text>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Details
                </Text>
                <Text as="p" variant="bodyMd">
                  ID: {job.id}
                </Text>
                <Text as="p" variant="bodyMd">
                  Created: {new Date(job.createdAt).toLocaleString()}
                </Text>
                {job.startedAt && (
                  <Text as="p" variant="bodyMd">
                    Started: {new Date(job.startedAt).toLocaleString()}
                  </Text>
                )}
                {job.completedAt && (
                  <Text as="p" variant="bodyMd">
                    Completed: {new Date(job.completedAt).toLocaleString()}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
