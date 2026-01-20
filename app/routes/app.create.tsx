import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useNavigate, useRouteError } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import prisma, { ensureShop } from "~/services/db.server";
import { addGenerationJob } from "~/services/generation/queue.server";
import { publishJobUpdate } from "~/services/generation/publisher.server";
import { runPreflightChecks } from "~/services/gatekeeper/preflight.server";
import { authenticate } from "~/shopify.server";
import { redisClient } from "~/services/redis.server";

const templateOptions = [
  { label: "Product", value: "product" },
  { label: "Collection", value: "collection" },
  { label: "Page", value: "page" },
  { label: "Article", value: "article" },
  { label: "Blog", value: "blog" },
];

type ActionData =
  | {
      jobId: string;
      existingJob?: boolean;
    }
  | {
      error: string;
      retryAfter?: number;
    };

export function ErrorBoundary() {
  const error = useRouteError() as Error;
  return (
    <Page>
      <Banner tone="critical" title="Application Error">
        <p>{error.message}</p>
        <pre>{error.stack}</pre>
      </Banner>
    </Page>
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  console.log(`[CreateAction] Checking Redis connection...`);
  try {
    await redisClient.ping();
    console.log(`[CreateAction] Redis is alive.`);
  } catch (err) {
    console.error(`[CreateAction] Redis is DEAD:`, err);
    return json({ error: "Redis connection failed. Please check your worker terminal." }, { status: 500 });
  }
  const templateType = String(formData.get("templateType") ?? "");
  const prompt = String(formData.get("prompt") ?? "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  
  console.log(`[CreateAction] Received request for ${templateType} from ${session.shop}`);

  const allowedTemplates = new Set(
    templateOptions.map((option) => option.value),
  );

  if (!prompt) {
    return json<ActionData>(
      { error: "Prompt is required." },
      { status: 400 },
    );
  }

  if (!allowedTemplates.has(templateType)) {
    return json<ActionData>(
      { error: "Invalid template type." },
      { status: 400 },
    );
  }

  try {
    await ensureShop(session.shop);

    const preflight = await runPreflightChecks(session.shop, {
      templateType,
      prompt,
      idempotencyKey,
    });

    if (!preflight.allowed) {
      const errorMessages: Record<string, string> = {
        RATE_LIMITED: `Rate limit exceeded. Try again in ${preflight.retryAfter ?? 60}s.`,
        CREDITS_EXHAUSTED: "Credit limit reached. Please contact support.",
        DAILY_CAP_REACHED: "Daily spend cap reached. Try again tomorrow.",
      };
      return json<ActionData>(
        {
          error: errorMessages[preflight.error] ?? "Unable to start job.",
          retryAfter: preflight.retryAfter,
        },
        { status: 429 },
      );
    }

    if (preflight.existingJobId) {
      console.log(`[CreateAction] Found existing job: ${preflight.existingJobId}`);
      return json<ActionData>({ jobId: preflight.existingJobId, existingJob: true });
    }

    const job = await prisma.generationJob.create({
      data: {
        shopId: session.shop,
        idempotencyKey: preflight.idempotencyKey,
        templateType,
        prompt,
        status: "PENDING",
      },
    });

    console.log(`[CreateAction] Created DB entry: ${job.id}. Adding to queue...`);

    await addGenerationJob(job.id, {
      jobId: job.id,
      shopId: session.shop,
      templateType,
      prompt,
      idempotencyKey: preflight.idempotencyKey,
    });

    console.log(`[CreateAction] Successfully added to queue.`);

    await publishJobUpdate(job.id, {
      status: "queued",
      message: "Job queued",
    });

    return json<ActionData>({ jobId: job.id });
  } catch (error) {
    console.error("[CreateAction] Unexpected error:", error);
    return json<ActionData>(
      { error: error instanceof Error ? error.message : "An internal error occurred." },
      { status: 500 }
    );
  }
};

export default function CreatePage() {
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const [templateType, setTemplateType] = useState("product");
  const [prompt, setPrompt] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "submitting") {
      setStatus(null);
      setMessage(null);
      setResult(null);
    }
  }, [fetcher.state]);

  useEffect(() => {
    if (!fetcher.data) return;

    if ("error" in fetcher.data) {
      setError(fetcher.data.error);
      setJobId(null);
      setStatus(null);
      setMessage(null);
      setResult(null);
      return;
    }

    setError(null);
    if ("jobId" in fetcher.data) {
      const newJobId = fetcher.data.jobId;
      setJobId(newJobId);
      // Use navigate() for client-side navigation within the embedded app context
      navigate(`/app/jobs/${newJobId}/details`);
      return;
    }
  }, [fetcher.data, navigate]);

  useEffect(() => {
    if (!jobId) return;

    const source = new EventSource(`/app/jobs/${jobId}/stream`);
    eventSourceRef.current = source;

    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as {
        status: string;
        message?: string;
        result?: unknown;
        error?: string;
      };

      setStatus(payload.status);
      setMessage(payload.message ?? null);

      if (payload.error) {
        setError(payload.error);
      }

      if (payload.result) {
        setResult(payload.result);
      }

      if (["completed", "failed", "cancelled"].includes(payload.status)) {
        source.close();
      }
    };

    source.onerror = () => {
      // If we already have a status, it means the stream was active but got interrupted.
      // We check if the job actually finished in the background before showing an error.
      if (status && ["completed", "failed", "cancelled"].includes(status.toLowerCase())) {
        source.close();
        return;
      }
      
      // Don't show "Connection lost" immediately; it might just be a brief flicker or a clean close
      console.log("SSE Connection closed or errored. Current status:", status);
      source.close();
    };

    return () => {
      source.close();
    };
  }, [jobId]);

  const handleCancel = () => {
    eventSourceRef.current?.close();
    setStatus("cancelled");
    setMessage("Cancelled by user.");
  };

  return (
    <Page>
      <TitleBar title="Create template" />
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" title="Something went wrong">
            <p>{error}</p>
          </Banner>
        ) : null}
        <Card>
          <fetcher.Form method="post">
            <FormLayout>
              <Select
                label="Template type"
                options={templateOptions}
                value={templateType}
                onChange={setTemplateType}
                name="templateType"
              />
              <TextField
                label="Prompt"
                value={prompt}
                onChange={setPrompt}
                name="prompt"
                multiline={4}
                autoComplete="off"
              />
              <InlineStack gap="300">
                <Button
                  variant="primary"
                  submit
                  loading={isSubmitting}
                  disabled={isSubmitting}
                >
                  Generate template
                </Button>
                <Button onClick={handleCancel} disabled={!jobId}>
                  Cancel
                </Button>
              </InlineStack>
            </FormLayout>
          </fetcher.Form>
        </Card>
        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingMd">
              Progress
            </Text>
            {status ? (
              <Text as="p" variant="bodyMd">
                Status: {status}
              </Text>
            ) : (
              <Text as="p" variant="bodyMd">
                Submit a prompt to start a generation job.
              </Text>
            )}
            {message ? (
              <Text as="p" variant="bodyMd">
                {message}
              </Text>
            ) : null}
            {result ? (
              <InlineStack gap="300" align="start">
                <Text as="p" variant="bodyMd">
                  Result ready.
                </Text>
                <Button url="/app" variant="plain">
                  View jobs
                </Button>
              </InlineStack>
            ) : null}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
