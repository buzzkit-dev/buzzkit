import { createInstrument, createLogger, createTraceRunner, currentService } from '@buzzkit/observability';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Line = { level: string; message: string; 'service.name': string; [key: string]: unknown };

const names = { fetch: 'svc-api', queue: 'svc-queue', scheduled: 'svc-scheduler' };

Object.assign(globalThis, {
  caches: { default: {}, open: async () => ({}) },
  scheduler: { wait: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)) },
});

function capture() {
  const lines: Line[] = [];
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((raw: unknown) => {
      if (typeof raw === 'string' && raw.startsWith('{')) lines.push(JSON.parse(raw));
    });
  }
  return lines;
}

function workerRequest(url: string) {
  return new Request(url) as Request<unknown, IncomingRequestCfProperties>;
}

function context() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: {
      waitUntil: (p: Promise<unknown>) => {
        pending.push(p);
      },
      passThroughOnException() {},
    } as unknown as ExecutionContext,
    settle: () => Promise.all(pending),
  };
}

const env = {};

describe('@buzzkit/observability', () => {
  let lines: Line[];
  beforeEach(() => {
    lines = capture();
  });
  afterEach(() => vi.restoreAllMocks());

  it('names the service per trigger and flushes logs after the invocation', async () => {
    const log = createLogger({ fallbackService: 'fallback' });
    const instrument = createInstrument(names);
    const handler = instrument({
      fetch: async () => {
        log.info('in fetch', { a: 1 });
        expect(currentService()).toBe(names.fetch);
        return new Response('ok');
      },
      queue: async () => {
        log.warn('in queue');
        expect(currentService()).toBe(names.queue);
      },
      scheduled: async () => {
        log.error('in cron');
        expect(currentService()).toBe(names.scheduled);
      },
    });

    const a = context();
    const response = await handler.fetch!(workerRequest('http://test/'), env, a.ctx);
    expect(response.status).toBe(200);
    await a.settle();

    const b = context();
    await handler.queue!(
      { queue: 'q', messages: [], ackAll() {}, retryAll() {} } as unknown as MessageBatch,
      env,
      b.ctx
    );
    await b.settle();

    const c = context();
    await handler.scheduled!({ cron: '* * * * *', scheduledTime: Date.now(), noRetry() {} }, env, c.ctx);
    await c.settle();

    expect(lines.map((l) => [l.level, l.message, l['service.name']])).toEqual([
      ['info', 'in fetch', names.fetch],
      ['warn', 'in queue', names.queue],
      ['error', 'in cron', names.scheduled],
    ]);
    expect(lines[0]?.a).toBe(1);
    expect(typeof lines[0]?.trace_id).toBe('string');
  });

  it('keeps concurrent invocations in separate buffers', async () => {
    const log = createLogger({ fallbackService: 'fallback' });
    const instrument = createInstrument(names);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = instrument({
      fetch: async (request) => {
        const tag = new URL(request.url).pathname;
        log.info(`first ${tag}`);
        if (tag === '/slow') await gate;
        log.info(`second ${tag}`);
        return new Response(tag);
      },
    });

    const slow = context();
    const fast = context();
    const slowRun = handler.fetch!(workerRequest('http://test/slow'), env, slow.ctx);
    await handler.fetch!(workerRequest('http://test/fast'), env, fast.ctx);
    await fast.settle();
    expect(lines.map((l) => l.message)).toEqual(['first /fast', 'second /fast']);

    release();
    await slowRun;
    await slow.settle();
    expect(lines.map((l) => l.message)).toEqual([
      'first /fast',
      'second /fast',
      'first /slow',
      'second /slow',
    ]);
  });

  it('logs outside an invocation go straight to the console with the fallback service', () => {
    const log = createLogger({ fallbackService: 'fallback' });
    log.info('orphan');
    expect(lines).toEqual([expect.objectContaining({ message: 'orphan', 'service.name': 'fallback' })]);
  });

  it('trace runner normalises attributes, nests spans, and records errors without swallowing them', async () => {
    const trace = createTraceRunner('test');
    const instrument = createInstrument(names);
    const handler = instrument({
      fetch: async () => {
        const seen = await trace(
          'outer',
          { when: new Date(0), nested: { a: 1 }, skip: undefined },
          async (t) => {
            t.set('count', 2);
            return t.trace('inner', async () => 'value');
          }
        );
        expect(seen).toBe('value');
        await expect(
          trace('boom', async () => {
            throw new Error('kaboom');
          })
        ).rejects.toThrow('kaboom');
        return new Response('ok');
      },
    });
    const run = context();
    const response = await handler.fetch!(workerRequest('http://test/'), env, run.ctx);
    expect(response.status).toBe(200);
    await run.settle();
  });
});
