import type { Span as OtelSpan, Tracer } from '@opentelemetry/api';

export type ObservabilityEnv = {
  ENVIRONMENT?: string;
  AXIOM_API_TOKEN?: string;
  AXIOM_LOGS_DATASET?: string;
  AXIOM_TRACES_DATASET?: string;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  TRACE_SAMPLE_RATIO?: string;
};

export type AttributeValue = string | number | boolean | Date | null | undefined | object;

export type Attributes = Record<string, AttributeValue>;

export type Span = {
  set(key: string, value: AttributeValue): void;
  trace<T>(name: string, fn: (t: Span) => Promise<T>): Promise<T>;
  trace<T>(name: string, attributes: Attributes, fn: (t: Span) => Promise<T>): Promise<T>;
};

export type OtlpTarget = { url: string; headers?: Record<string, string> };

export function otlpTarget(env: ObservabilityEnv): OtlpTarget | null {
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return { url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces` };
  }

  if (env.AXIOM_API_TOKEN && env.AXIOM_TRACES_DATASET) {
    return {
      url: 'https://api.axiom.co/v1/traces',
      headers: {
        Authorization: `Bearer ${env.AXIOM_API_TOKEN}`,
        'X-Axiom-Dataset': env.AXIOM_TRACES_DATASET,
      },
    };
  }

  return null;
}

function normalizeAttribute(value: AttributeValue): string | number | boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

export function applyAttributes(span: OtelSpan, attributes: Attributes | undefined): void {
  if (!attributes) return;
  for (const [key, raw] of Object.entries(attributes)) {
    const value = normalizeAttribute(raw);
    if (value !== undefined) span.setAttribute(key, value);
  }
}

export type SpanRunner = {
  run: {
    <T>(name: string, fn: (t: Span) => Promise<T>): Promise<T>;
    <T>(name: string, attributes: Attributes, fn: (t: Span) => Promise<T>): Promise<T>;
    <T>(name: string, attributesOrFn: unknown, maybeFn?: unknown): Promise<T>;
  };
  handle(span: OtelSpan): Span;
  silentSpan: Span;
};

export function createSpanRunner(getTracer: () => Tracer, silenced: () => boolean): SpanRunner {
  const handle = (span: OtelSpan): Span => ({
    set: (key, value) => applyAttributes(span, { [key]: value }),
    trace: (name: string, attributesOrFn: unknown, maybeFn?: unknown) => run(name, attributesOrFn, maybeFn),
  });

  function run<T>(name: string, fn: (t: Span) => Promise<T>): Promise<T>;
  function run<T>(name: string, attributes: Attributes, fn: (t: Span) => Promise<T>): Promise<T>;
  function run<T>(name: string, attributesOrFn: unknown, maybeFn?: unknown): Promise<T>;
  function run<T>(name: string, attributesOrFn: unknown, maybeFn?: unknown): Promise<T> {
    const fn = (typeof attributesOrFn === 'function' ? attributesOrFn : maybeFn) as (t: Span) => Promise<T>;
    const attributes = typeof attributesOrFn === 'function' ? undefined : (attributesOrFn as Attributes);

    if (silenced()) return fn(silentSpan);

    return getTracer().startActiveSpan(name, async (span: OtelSpan) => {
      try {
        applyAttributes(span, attributes);
        return await fn(handle(span));
      } catch (error) {
        span.recordException(error as Error);
        span.setAttribute('error', true);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  const silentSpan: Span = {
    set: () => {},
    trace: (name: string, attributesOrFn: unknown, maybeFn?: unknown) => run(name, attributesOrFn, maybeFn),
  };

  return { run, handle, silentSpan };
}
