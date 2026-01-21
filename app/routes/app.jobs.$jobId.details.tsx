import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigate, useSubmit, useNavigation } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate, apiVersion } from "~/shopify.server";
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

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const jobId = params.jobId;

  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    include: { shop: true },
  });

  if (!job || job.shopId !== session.shop || !job.result) {
    return json({ error: "Job or result not found" }, { status: 404 });
  }

  const targetThemeId = job.shop.targetThemeId;
  
  // We've moved to a manual copy-paste flow due to Shopify API restrictions on direct asset writes.
  // The action is now kept for any future server-side state updates if needed.
  return json({ success: true, targetThemeId });
};

export default function JobDetails() {
  const { job } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [showSuccess, setShowSuccess] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'none' | 'filename' | 'result'>('none');
  const [fileNameSuffix, setFileNameSuffix] = useState(job.id.slice(0, 6));

  const fullFileName = `templates/${job.templateType}.${fileNameSuffix}.json`;
  const cleanThemeId = job.shop.targetThemeId?.split('/').pop() || job.shop.targetThemeId;
  const themeEditUrl = `https://admin.shopify.com/store/${job.shopId.split('.')[0]}/themes/${cleanThemeId}/editor`;
  // Alternative direct code editor URL
  const themeCodeUrl = `https://admin.shopify.com/store/${job.shopId.split('.')[0]}/themes/${cleanThemeId}?key=templates/${job.templateType}.${fileNameSuffix}.json`;

  const copyToClipboard = async (text: string, type: 'filename' | 'result') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(type);
      setTimeout(() => setCopyStatus('none'), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  // Auto-refresh the page every 3 seconds if the job is not finished
  useEffect(() => {
    if (["PENDING", "PROCESSING", "VALIDATING", "WRITING"].includes(job.status)) {
      const timer = setTimeout(() => {
        navigate(".", { replace: true });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [job.status, navigate]);

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
                <InlineStack align="space-between">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                      Status
                    </Text>
                    <Badge tone={job.status === "COMPLETED" ? "success" : "info"}>
                      {job.status}
                    </Badge>
                  </BlockStack>
                </InlineStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Prompt
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {job.prompt}
                  </Text>
                </BlockStack>
              </Card>

              {job.status === "COMPLETED" && (
                <>
                  <Card>
                    <BlockStack gap="300">
                      <Text as="h2" variant="headingMd">
                        Filename
                      </Text>
                      <InlineStack gap="200" align="start" blockAlign="center">
                        <Box paddingBlockStart="100">
                          <Text as="span" variant="bodyMd" fontWeight="bold">
                            templates/{job.templateType}.
                          </Text>
                        </Box>
                        <div style={{ width: '150px' }}>
                          <input
                            type="text"
                            value={fileNameSuffix}
                            onChange={(e) => setFileNameSuffix(e.target.value.replace(/[^a-z0-9_-]/gi, ''))}
                            style={{
                              width: '100%',
                              padding: '6px 12px',
                              border: '1px solid #c9cccf',
                              borderRadius: '8px'
                            }}
                          />
                        </div>
                        <Box paddingBlockStart="100">
                          <Text as="span" variant="bodyMd" fontWeight="bold">
                            .json
                          </Text>
                        </Box>
                        <Button 
                          icon={copyStatus === 'filename' ? 'Check' : undefined}
                          onClick={() => copyToClipboard(fullFileName, 'filename')}
                        >
                          {copyStatus === 'filename' ? 'Copied' : 'Copy Name'}
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text as="h2" variant="headingMd">
                          Result JSON
                        </Text>
                        <Button 
                          variant="primary"
                          onClick={() => copyToClipboard(JSON.stringify(job.result, null, 2), 'result')}
                        >
                          {copyStatus === 'result' ? 'Copied!' : 'Copy JSON'}
                        </Button>
                      </InlineStack>
                      {job.result ? (
                        <Box
                          padding="400"
                          background="bg-surface-secondary"
                          borderRadius="200"
                          overflowX="auto"
                        >
                          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: '12px' }}>
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

                  <Card>
                    <BlockStack gap="300">
                      <Text as="h2" variant="headingMd">
                        Target Theme
                      </Text>
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            {job.shop.targetThemeId || 'No theme selected'}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            This is the theme where you should add the template.
                          </Text>
                        </BlockStack>
                        <Button 
                          url={`https://admin.shopify.com/store/${job.shopId.split('.')[0]}/themes/${cleanThemeId}?key=${fullFileName}`}
                          external
                          variant="primary"
                        >
                          Edit Theme Code
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  <Banner title="How to install this template">
                    <BlockStack gap="200">
                      <Text as="p">1. Click <strong>Copy Name</strong> above.</Text>
                      <Text as="p">2. Click <strong>Edit Theme Code</strong> to open the Shopify code editor.</Text>
                      <Text as="p">3. In the editor, click <strong>Add a new template</strong> under the <strong>Templates</strong> folder.</Text>
                      <Text as="p">4. Select <strong>{job.templateType}</strong> and paste the copied name into the file name field.</Text>
                      <Text as="p">5. Come back here and click <strong>Copy JSON</strong>.</Text>
                      <Text as="p">6. Paste the JSON into your new file, replacing everything, and click <strong>Save</strong>.</Text>
                    </BlockStack>
                  </Banner>

                  <Banner tone="warning" title="Safety Warning">
                    <p>
                      We strongly encourage you to make sure you know what you are doing and have <strong>backed up the theme</strong> you are modifying. 
                      Be careful not to edit existing files as that may break your theme completely.
                    </p>
                  </Banner>
                </>
              )}
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
