import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, useSubmit, useNavigation } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  DataTable,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Select,
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
  const { admin, session } = await authenticate.admin(request);

  let themes: any[] = [];
  if (admin) {
    try {
      const response = await admin.graphql(`
        query getThemes {
          themes(first: 10) {
            nodes {
              id
              name
              role
            }
          }
        }
      `);
      const themesData: any = await response.json();
      themes = themesData?.data?.themes?.nodes?.map((t: any) => ({
        ...t,
        id: t.id.split("/").pop(), // Convert GID to numeric ID for compatibility
      })) || [];
    } catch (error) {
      console.error("Failed to fetch themes:", error);
    }
  }

  const [jobs, shop] = await Promise.all([
    prisma.generationJob.findMany({
      where: { shopId: session.shop },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.shop.findUnique({
      where: { id: session.shop },
      select: { targetThemeId: true },
    }),
  ]);

  return { 
    jobs, 
    themes, 
    targetThemeId: shop?.targetThemeId || themes.find(t => t.role === "main")?.id?.toString() 
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const themeId = formData.get("themeId") as string;

  if (themeId) {
    await prisma.shop.upsert({
      where: { id: session.shop },
      update: { targetThemeId: themeId },
      create: { 
        id: session.shop,
        targetThemeId: themeId 
      },
    });
  }

  return { success: true };
};

export default function Dashboard() {
  const { jobs, themes, targetThemeId } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const isUpdatingTheme = 
    navigation.state === "submitting" && 
    navigation.formData?.get("themeId") !== undefined;

  const currentTheme = themes.find((theme: any) => String(theme.id) === String(targetThemeId));
  const themeOptions = themes.map((theme: any) => ({
    label: `${theme.name}${theme.role === "main" ? " (Published)" : ` (${theme.role})`}`,
    value: String(theme.id),
  }));

  const handleThemeChange = (value: string) => {
    submit({ themeId: value }, { method: "POST" });
  };

  const rows = jobs.map((job) => [
    <Link 
      key={job.id} 
      to={`/app/jobs/${job.id}/details`}
      style={{ color: "#005bd3", textDecoration: "underline" }}
    >
      {job.templateType}
    </Link>,
    <Badge key={job.id} tone={statusToneMap[job.status]}>
      {job.status}
    </Badge>,
    new Date(job.createdAt).toLocaleString(),
  ]);

  return (
    <Page>
      <TitleBar title="ThemeDraft Dashboard" />
      <BlockStack gap="400">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Target Theme
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Select the theme where generated templates will be written.
                  </Text>
                </BlockStack>

                {currentTheme ? (
                  <Banner 
                    tone={currentTheme.role === "main" ? "success" : "info"}
                    title={currentTheme.role === "main" ? "Published Theme Selected" : "Development Theme Selected"}
                  >
                    <p>
                      Currently targeting: <strong>{currentTheme.name}</strong>
                    </p>
                  </Banner>
                ) : (
                  <Banner tone="warning">
                    <p>No target theme selected or detected. Please choose a theme below.</p>
                  </Banner>
                )}

                <Select
                  label="Available Themes"
                  options={themeOptions}
                  value={targetThemeId}
                  onChange={handleThemeChange}
                  disabled={isUpdatingTheme}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

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
