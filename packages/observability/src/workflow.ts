import { OTLPExporter } from '@microlabs/otel-cf-workers';
import { type Link, trace as otelTrace, ROOT_CONTEXT, SpanKind, TraceFlags } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BasicTracerProvider,
  type IdGenerator,
  SimpleSpanProcessor,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import {
  type Attributes,
  applyAttributes,
  createSpanRunner,
  type ObservabilityEnv,
  otlpTarget,
  type Span,
} from './shared';

export type WorkflowRunIdentity = {
  service: string;
  workflow: string;
  runId: string;
  traceparent?: string;
  attributes?: Attributes;
};

export type WorkflowRunOutcome = {
  result: 'completed' | 'failed';
  startedAt: Date;
  error?: string;
};

type FlushOptions = { waitUntil?: (promise: Promise<unknown>) => void };

const silent = createSpanRunner(
  () => otelTrace.getTracer('buzzkit-workflows'),
  () => true
);

async function deriveRunIds(runId: string): Promise<{ traceId: string; spanId: string }> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`buzzkit-run:${runId}`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { traceId: hex.slice(0, 32), spanId: hex.slice(32, 48) };
}

function triggerLinks(traceparent: string | undefined): Link[] {
  const match = traceparent?.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/);
  if (!match) return [];
  return [
    {
      context: {
        traceId: match[1]!,
        spanId: match[2]!,
        traceFlags: TraceFlags.SAMPLED,
        isRemote: true,
      },
    },
  ];
}

function createProvider(
  env: ObservabilityEnv,
  service: string,
  idGenerator?: IdGenerator
): BasicTracerProvider | null {
  const target = otlpTarget(env);
  if (!target) return null;
  return new BasicTracerProvider({
    resource: resourceFromAttributes({ 'service.name': service, 'service.namespace': 'buzzkit' }),
    spanProcessors: [new SimpleSpanProcessor(new OTLPExporter(target) as SpanExporter)],
    ...(idGenerator ? { idGenerator } : {}),
  });
}

function flushProvider(provider: BasicTracerProvider, options: FlushOptions): Promise<void> {
  const flush = provider
    .forceFlush()
    .then(() => provider.shutdown())
    .catch(() => {});
  if (options.waitUntil) {
    options.waitUntil(flush);
    return Promise.resolve();
  }
  return flush;
}

function runAttributes(run: WorkflowRunIdentity): Attributes {
  return { 'workflow.name': run.workflow, 'workflow.run.id': run.runId, ...run.attributes };
}

export async function runWorkflowStep<T>(
  env: ObservabilityEnv,
  run: WorkflowRunIdentity,
  step: string,
  fn: (t: Span) => Promise<T>,
  options: FlushOptions = {}
): Promise<T> {
  const provider = createProvider(env, run.service);
  if (!provider) return fn(silent.silentSpan);

  const ids = await deriveRunIds(run.runId);
  const parent = otelTrace.setSpanContext(ROOT_CONTEXT, {
    traceId: ids.traceId,
    spanId: ids.spanId,
    traceFlags: TraceFlags.SAMPLED,
    isRemote: false,
  });
  const tracer = provider.getTracer('buzzkit-workflows');
  const runner = createSpanRunner(
    () => tracer,
    () => false
  );

  try {
    return await tracer.startActiveSpan(
      `workflow.step ${step}`,
      { kind: SpanKind.INTERNAL, links: triggerLinks(run.traceparent) },
      parent,
      async (span) => {
        try {
          applyAttributes(span, { ...runAttributes(run), 'workflow.step.name': step });
          return await fn(runner.handle(span));
        } catch (error) {
          span.recordException(error as Error);
          span.setAttribute('error', true);
          throw error;
        } finally {
          span.end();
        }
      }
    );
  } finally {
    await flushProvider(provider, options);
  }
}

export async function recordWorkflowRun(
  env: ObservabilityEnv,
  run: WorkflowRunIdentity,
  outcome: WorkflowRunOutcome,
  options: FlushOptions = {}
): Promise<void> {
  const ids = await deriveRunIds(run.runId);
  const provider = createProvider(env, run.service, {
    generateTraceId: () => ids.traceId,
    generateSpanId: () => ids.spanId,
  });
  if (!provider) return;

  const span = provider.getTracer('buzzkit-workflows').startSpan(
    `workflow.run ${run.workflow}`,
    {
      kind: SpanKind.CONSUMER,
      startTime: outcome.startedAt,
      links: triggerLinks(run.traceparent),
    },
    ROOT_CONTEXT
  );
  applyAttributes(span, {
    ...runAttributes(run),
    'workflow.run.result': outcome.result,
    ...(outcome.error ? { error: true, 'workflow.run.error': outcome.error } : {}),
  });
  span.end();
  await flushProvider(provider, options);
}
