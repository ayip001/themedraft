import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Button,
  Card,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
  Banner,
  Spinner,
} from "@shopify/polaris";
import { useEffect, useMemo, useRef, useState } from "react";
import { addGenerationJob } from "~/services/generation/queue.server";
import { prisma, requireShopId } from "~/services/db.server";
import { runPreflightChecks } from "~/services/gatekeeper/preflight.server";

const templateOptions = [
  { label: "Product", value: "product" },
  { label: "Collection", value: "collection" },
  { label: "Page", value: "page" },
  { label: "Article", value: "article" },
  { label: "Blog", value: "blog" },
];

type ActionData =
  | {
      ok: true;
      jobId: string;
    }
  | {
      ok: false;
      error: string;
      retryAfter?: number;
    };

export async function loader({ request }: LoaderFunctionArgs) {
  const shopId = await requireShopId(request);
  return json({ shopId });
}

export async function action({ request }: ActionFunctionArgs) {
  const shopId = await requireShopId(request);
  const formData = await request.formData();
  const templateType = String(formData.get("templateType") ?? "");
  const prompt = String(formData.get("prompt") ?? "").trim();

  if (!prompt) {
    return json<ActionData>({ ok: false, error: "Prompt cannot be empty." }, { status: 400 });
  }

  const preflight = await runPreflightChecks(shopId, {
    templateType,
    prompt,
  });

  if (!preflight.allowed) {
    const message =
      preflight.error === "RATE_LIMITED"
        ? "Rate limit exceeded. Please wait before trying again."
        : preflight.error === "CREDITS_EXHAUSTED"
          ? "Credit limit reached."
          : "Daily spend cap reached.";

    return json<ActionData>(
      { ok: false, error: message, retryAfter: preflight.retryAfter },
      { status: 429 },
    );
  }

  if (preflight.existingJobId) {
    return json<ActionData>({ ok: true, jobId: preflight.existingJobId });
  }

  const job = await prisma.generationJob.create({
    data: {
      shopId,
      templateType,
      prompt,
      idempotencyKey: preflight.idempotencyKey ?? "",
      status: "PENDING",
    },
  });

  await addGenerationJob(job.id, {
    jobId: job.id,
    shopId,
    templateType,
    prompt,
  });

  return json<ActionData>({ ok: true, jobId: job.id });
}

export default function CreatePage() {
  const { shopId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [templateType, setTemplateType] = useState("product");
  const [prompt, setPrompt] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const isSubmitting = navigation.state === "submitting";
  const jobId = actionData && actionData.ok ? actionData.jobId : null;

  const startEventSource = (id: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const source = new EventSource(`/app/jobs/${id}`);
    eventSourceRef.current = source;

    source.onmessage = (event) => {
      setEvents((prev) => [...prev, event.data]);
      try {
        const payload = JSON.parse(event.data);
        setStatus(payload.status ?? null);
      } catch {
        setStatus(event.data);
      }
    };

    source.onerror = () => {
      setStatus("error");
      source.close();
    };
  };

  useEffect(() => {
    if (jobId) {
      startEventSource(jobId);
    }

    return () => {
      eventSourceRef.current?.close();
    };
  }, [jobId]);

  const progressText = useMemo(() => {
    if (!status) return "";
    return status === "completed"
      ? "Completed"
      : status === "failed"
        ? "Failed"
        : status === "cancelled"
          ? "Cancelled"
          : `Status: ${status}`;
  }, [status]);

  return (
    <Page title="Generate Template" backAction={{ content: "Back", url: `/app?shop=${shopId}` }}>
      <Card>
        <Form method="post">
          <input type="hidden" name="shop" value={shopId} />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Select
              label="Template type"
              options={templateOptions}
              value={templateType}
              onChange={(value) => setTemplateType(value)}
              name="templateType"
            />
            <TextField
              label="Prompt"
              multiline={4}
              value={prompt}
              onChange={(value) => setPrompt(value)}
              name="prompt"
              autoComplete="off"
              error={
                actionData && !actionData.ok ? actionData.error : undefined
              }
            />
            <InlineStack gap="400">
              <Button submit variant="primary" loading={isSubmitting}>
                Generate
              </Button>
              <Button
                disabled={!eventSourceRef.current}
                onClick={() => {
                  eventSourceRef.current?.close();
                  setStatus("cancelled");
                }}
              >
                Cancel
              </Button>
            </InlineStack>
          </div>
        </Form>
      </Card>

      {actionData && !actionData.ok ? (
        <Banner tone="critical" title="Request blocked">
          <p>{actionData.error}</p>
        </Banner>
      ) : null}

      {jobId ? (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Text as="h2" variant="headingMd">
              Job {jobId}
            </Text>
            {status && (
              <Text as="p" variant="bodyMd">
                {progressText}
              </Text>
            )}
            {status && status !== "completed" && status !== "failed" ? (
              <InlineStack gap="200" align="center">
                <Spinner size="small" />
                <Text as="span" variant="bodySm">
                  Listening for updates...
                </Text>
              </InlineStack>
            ) : null}
            {status === "completed" ? (
              <Button url={`/app?shop=${shopId}`}>View Jobs</Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {events.length > 0 ? (
        <Card>
          <Text as="h3" variant="headingSm">
            Progress log
          </Text>
          <ul>
            {events.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <Link to={`/app?shop=${shopId}`}>Back to dashboard</Link>
      </div>
    </Page>
  );
}
