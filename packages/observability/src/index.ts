import { AsyncLocalStorage } from 'node:async_hooks';
import {
  createSampler,
  exportSpans,
  instrumentDO,
  isHeadSampled,
  isMessageBatch,
  isRequest,
  isRootErrorSpan,
  multiTailSampler,
  instrument as otelInstrument,
  type ResolveConfigFn,
  type TraceConfig,
  type Trigger,
} from '@microlabs/otel-cf-workers';
import {
  context,
  type Span as OtelSpan,
  trace as otelTrace,
  ROOT_CONTEXT,
  TraceFlags,
} from '@opentelemetry/api';

export type ObservabilityEnv = {
  ENVIRONMENT?: string;
  AXIOM_API_TOKEN?: string;
  AXIOM_LOGS_DATASET?: string;
  AXIOM_TRACES_DATASET?: string;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  TRACE_SAMPLE_RATIO?: string;
};

export type ServiceNames = {
  fetch: string;
  queue: string;
  scheduled: string;
};

export type AttributeValue = string | number | boolean | Date | null | undefined | object;

export type Attributes = Record<string, AttributeValue>;

export type Span = {
  set(key: string, value: AttributeValue): void;
  trace<T>(name: string, fn: (t: Span) => Promise<T>): Promise<T>;
  trace<T>(name: string, attributes: Attributes, fn: (t: Span) => Promise<T>): Promise<T>;
};

type Level = 'debug' | 'info' | 'warn' | 'error';

type LogEntry = {
  _time: string;
  level: Level;
  message: string;
  'service.name': string;
  trace_id?: string;
  span_id?: string;
  [key: string]: unknown;
};

type Invocation = {
  service: string;
  traced: boolean;
  entries: LogEntry[];
};

const invocations = new AsyncLocalStorage<Invocation>();

const LEVEL_COLORS: Record<Level, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

function normalizeAttribute(value: AttributeValue): string | number | boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function applyAttributes(span: OtelSpan, attributes: Attributes | undefined): void {
  if (!attributes) return;
  for (const [key, raw] of Object.entries(attributes)) {
    const value = normalizeAttribute(raw);
    if (value !== undefined) span.setAttribute(key, value);
  }
}

function traceContext(): { trace_id?: string; span_id?: string } {
  const span = otelTrace.getActiveSpan();
  if (!span) return {};
  const { traceId, spanId } = span.spanContext();
  return { trace_id: traceId, span_id: spanId };
}

export function getActiveSpan(): OtelSpan | undefined {
  return otelTrace.getActiveSpan();
}

export function currentService(): string | undefined {
  return invocations.getStore()?.service;
}

export function createTraceRunner(tracerName: string) {
  const tracer = otelTrace.getTracer(tracerName);

  const createSpan = (span: OtelSpan): Span => ({
    set: (key, value) => applyAttributes(span, { [key]: value }),
    trace: (name: string, attributesOrFn: unknown, maybeFn?: unknown) => run(name, attributesOrFn, maybeFn),
  });

  function run<T>(name: string, fn: (t: Span) => Promise<T>): Promise<T>;
  function run<T>(name: string, attributes: Attributes, fn: (t: Span) => Promise<T>): Promise<T>;
  function run<T>(name: string, attributesOrFn: unknown, maybeFn?: unknown): Promise<T>;
  function run<T>(name: string, attributesOrFn: unknown, maybeFn?: unknown): Promise<T> {
    const fn = (typeof attributesOrFn === 'function' ? attributesOrFn : maybeFn) as (t: Span) => Promise<T>;
    const attributes = typeof attributesOrFn === 'function' ? undefined : (attributesOrFn as Attributes);

    if (invocations.getStore()?.traced === false) return fn(silentSpan);

    return tracer.startActiveSpan(name, async (span: OtelSpan) => {
      try {
        applyAttributes(span, attributes);
        return await fn(createSpan(span));
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

  return run;
}

export function createLogger(options: { fallbackService: string }) {
  const write = (level: Level, message: string, fields?: Record<string, unknown>) => {
    const invocation = invocations.getStore();
    const entry: LogEntry = {
      _time: new Date().toISOString(),
      level,
      message,
      'service.name': invocation?.service ?? options.fallbackService,
      ...traceContext(),
      ...fields,
    };

    if (invocation) {
      invocation.entries.push(entry);
      return;
    }

    emit(entry, undefined);
  };

  return {
    debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
    info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
    warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
    error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
    flush: (env: ObservabilityEnv) => flush(env),
  };
}

function emit(entry: LogEntry, env: ObservabilityEnv | undefined): void {
  if (env?.ENVIRONMENT === 'development') {
    const { _time, level, message, 'service.name': service, trace_id, span_id, ...fields } = entry;
    const suffix = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
    // biome-ignore lint/suspicious/noConsole: console is the development log sink
    console[level](
      `${LEVEL_COLORS[level]}[${service}] ${level.toUpperCase()}${'\x1b[0m'} ${message}${suffix}`
    );
    return;
  }

  // biome-ignore lint/suspicious/noConsole: console is the Workers Logs sink
  console[entry.level](JSON.stringify(entry));
}

async function flush(env: ObservabilityEnv): Promise<void> {
  const invocation = invocations.getStore();
  if (!invocation || invocation.entries.length === 0) return;

  const entries = invocation.entries.splice(0, invocation.entries.length);
  const development = env.ENVIRONMENT === 'development';

  for (const entry of entries) {
    if (entry.level === 'debug' && !development) continue;
    emit(entry, env);
  }

  if (development || !env.AXIOM_API_TOKEN || !env.AXIOM_LOGS_DATASET) return;

  const rawFetch = globalThis.fetch.bind(globalThis);
  await context.with(ROOT_CONTEXT, async () => {
    try {
      await rawFetch(`${'https://api.axiom.co/v1/datasets'}/${env.AXIOM_LOGS_DATASET}/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.AXIOM_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entries),
      });
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: the log shipper has no other sink for its own failures
      console.error(JSON.stringify({ level: 'error', message: 'Log shipping failed', error: String(error) }));
    }
  });
}

function serviceFor(names: ServiceNames, trigger: Trigger): string {
  if (isRequest(trigger)) return names.fetch;
  if (isMessageBatch(trigger)) return names.queue;
  return names.scheduled;
}

function sampleRatio(env: ObservabilityEnv): number {
  const ratio = Number(env.TRACE_SAMPLE_RATIO ?? '1');
  return Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : 1;
}

const noopSpanProcessor = {
  onStart() {},
  onEnd() {},
  forceFlush: async () => {},
  shutdown: async () => {},
};

type TraceSink =
  | Pick<Extract<TraceConfig, { exporter: unknown }>, 'exporter'>
  | Pick<Extract<TraceConfig, { spanProcessors: unknown }>, 'spanProcessors'>;

function traceSink(env: ObservabilityEnv): TraceSink {
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return { exporter: { url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces` } };
  }

  if (env.AXIOM_API_TOKEN && env.AXIOM_TRACES_DATASET) {
    return {
      exporter: {
        url: 'https://api.axiom.co/v1/traces',
        headers: {
          Authorization: `Bearer ${env.AXIOM_API_TOKEN}`,
          'X-Axiom-Dataset': env.AXIOM_TRACES_DATASET,
        },
      },
    };
  }

  return { spanProcessors: [noopSpanProcessor] };
}

function resolveTraceConfig(
  env: ObservabilityEnv,
  service: string,
  options: { version?: string; acceptRemote: boolean }
): TraceConfig {
  return {
    ...traceSink(env),
    service: { name: service, namespace: 'buzzkit', version: options.version },
    sampling: {
      headSampler: createSampler({ acceptRemote: options.acceptRemote, ratio: sampleRatio(env) }),
      tailSampler: multiTailSampler([isHeadSampled, isRootErrorSpan]),
    },
  } as TraceConfig;
}

export function runInvocation<T>(
  service: string,
  env: ObservabilityEnv,
  ctx: { waitUntil(promise: Promise<unknown>): void },
  fn: () => Promise<T>,
  options: { traced?: boolean } = {}
): Promise<T> {
  return invocations.run({ service, traced: options.traced ?? true, entries: [] }, async () => {
    try {
      return await fn();
    } finally {
      ctx.waitUntil(flush(env));
    }
  });
}

export function activeTraceId(): string | undefined {
  return otelTrace.getActiveSpan()?.spanContext().traceId;
}

export function flushSpans(traceId: string): Promise<void> {
  return exportSpans(traceId);
}

export function currentTraceparent(): string | undefined {
  const span = otelTrace.getActiveSpan();
  if (!span) return undefined;
  const { traceId, spanId, traceFlags } = span.spanContext();
  return `00-${traceId}-${spanId}-${traceFlags.toString(16).padStart(2, '0')}`;
}

export function withTraceparent<T>(traceparent: string | undefined, fn: () => Promise<T>): Promise<T> {
  const match = traceparent?.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/);
  if (!match) return fn();
  const parent = otelTrace.setSpanContext(context.active(), {
    traceId: match[1]!,
    spanId: match[2]!,
    traceFlags: Number.parseInt(match[3]!, 16) & TraceFlags.SAMPLED ? TraceFlags.SAMPLED : TraceFlags.NONE,
    isRemote: true,
  });
  return context.with(parent, fn);
}

export function createActorInstrument(service: string, options: { version?: string } = {}) {
  return <T>(actorClass: T): T =>
    instrumentDO(
      actorClass as never,
      ((env: ObservabilityEnv) =>
        resolveTraceConfig(env, service, { version: options.version, acceptRemote: true })) as never
    ) as T;
}

export function createInstrument(names: ServiceNames, options: { version?: string } = {}) {
  const resolveConfig: ResolveConfigFn<ObservabilityEnv> = (env, trigger) =>
    resolveTraceConfig(env, serviceFor(names, trigger), { version: options.version, acceptRemote: false });

  const withInvocation = runInvocation;

  return <Env extends ObservabilityEnv, Message>(
    handler: ExportedHandler<Env, Message>
  ): ExportedHandler<Env, Message> => {
    const wrapped: ExportedHandler<Env, Message> = {};

    if (handler.fetch) {
      const fetch = handler.fetch;
      wrapped.fetch = (request, env, ctx) =>
        withInvocation(names.fetch, env, ctx, async () => await fetch(request, env, ctx));
    }

    if (handler.queue) {
      const queue = handler.queue;
      wrapped.queue = (batch, env, ctx) =>
        withInvocation(names.queue, env, ctx, async () => await queue(batch, env, ctx));
    }

    if (handler.scheduled) {
      const scheduled = handler.scheduled;
      wrapped.scheduled = (controller, env, ctx) =>
        withInvocation(names.scheduled, env, ctx, async () => await scheduled(controller, env, ctx));
    }

    return otelInstrument(wrapped as never, resolveConfig as never) as ExportedHandler<Env, Message>;
  };
}
