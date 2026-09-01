import { runFetch } from '@buzzkit/api/engine/steps/fetch';
import type { FetchStep, WorkflowSpec } from '@buzzkit/schema/workflows';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDryRunContext, createHarness } from '../../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@buzzkit/api/libs/database', () => ({ stepDb: vi.fn(() => ({})) }));
vi.mock('@buzzkit/api/api/secrets/index', () => ({
  resolveSecrets: vi.fn(async () => ({ API_KEY: 'shh' })),
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const step: FetchStep = {
  name: 'notify',
  fetch: {
    url: 'https://api.example.com/hook',
    headers: { authorization: 'Bearer {{secrets.API_KEY}}' },
    body: { user: '{{subscriber.externalId}}' },
    as: 'answer',
  },
};

const spec: WorkflowSpec = { trigger: { event: 'signup' }, steps: [step] };

describe('runFetch', () => {
  it('renders secrets into headers, posts JSON, and stores the parsed answer', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'queued' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const { context, actor } = createHarness(spec);

    await runFetch(context, step);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.example.com/hook');
    const headers = new Headers(((init as RequestInit).headers ?? {}) as Record<string, string>);
    expect(headers.get('authorization')).toBe('Bearer shh');
    expect(headers.get('webhook-id')).toBe(`${context.params.runId}:notify`);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ user: 'user_1' });
    expect(context.state.steps.notify).toMatchObject({ status: 200, data: { status: 'queued' } });
    expect(context.state.vars.answer).toEqual({ status: 'queued' });
    expect(actor.steps[0]!.summary).toBe('Fetched POST api.example.com (200)');
  });

  it('refuses non-https addresses without calling out', async () => {
    const insecure: FetchStep = { name: 'notify', fetch: { url: 'http://api.example.com/hook' } };
    const { context } = createHarness({ ...spec, steps: [insecure] });

    await expect(runFetch(context, insecure)).rejects.toThrow('fetch_blocked');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a 5xx answer through the Workflow retry config', async () => {
    fetchMock.mockResolvedValueOnce(new Response('down', { status: 503 })).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const { context } = createHarness(spec);

    await runFetch(context, step);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(context.state.steps.notify).toMatchObject({ status: 200 });
  });

  it('fails permanently on an unexpected 4xx', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
    const { context } = createHarness(spec);

    await expect(runFetch(context, step)).rejects.toThrow('answered 403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts a status the step explicitly expects', async () => {
    const expecting: FetchStep = {
      name: 'notify',
      fetch: { url: 'https://api.example.com/hook', expect: { status: [404] } },
    };
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    const { context } = createHarness({ ...spec, steps: [expecting] });

    await runFetch(context, expecting);

    expect(context.state.steps.notify).toMatchObject({ status: 404, data: 'missing' });
  });

  it('continues with a null answer when onError is continue', async () => {
    const tolerant: FetchStep = {
      name: 'notify',
      fetch: { url: 'https://api.example.com/hook', onError: 'continue', as: 'answer' },
    };
    fetchMock.mockResolvedValue(new Response('nope', { status: 400 }));
    const { context, actor } = createHarness({ ...spec, steps: [tolerant] });

    await runFetch(context, tolerant);

    expect(context.state.steps.notify).toMatchObject({ failed: true, status: null, data: null });
    expect(context.state.vars.answer).toBeNull();
    expect(actor.steps.at(-1)!.summary).toContain('Continued without data');
  });

  it('skips the step when onError is skip', async () => {
    const skipping: FetchStep = {
      name: 'notify',
      fetch: { url: 'https://api.example.com/hook', onError: 'skip' },
    };
    fetchMock.mockResolvedValue(new Response('nope', { status: 400 }));
    const { context, actor } = createHarness({ ...spec, steps: [skipping] });

    await runFetch(context, skipping);

    expect(actor.steps.at(-1)).toMatchObject({ status: 'skipped' });
  });

  it('rejects an oversized answer', async () => {
    fetchMock.mockResolvedValueOnce(new Response('x'.repeat(300_000), { status: 200 }));
    const { context } = createHarness(spec);

    await expect(runFetch(context, step)).rejects.toThrow('more than');
  });

  it('describes the call in a dry run and honors an assumed status', async () => {
    const context = createDryRunContext(spec, { assume: { notify: { status: 200, data: { ok: 1 } } } });

    await runFetch(context, step);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(context.state.steps.notify).toMatchObject({ status: 200, data: { ok: 1 } });
    expect(context.trace[0]!.summary).toContain('Assumed api.example.com answers 200');
  });

  it('refuses a string that is not an address at all', async () => {
    const broken: FetchStep = { name: 'notify', fetch: { url: 'not a url' } };
    const { context } = createHarness({ ...spec, steps: [broken] });

    await expect(runFetch(context, broken)).rejects.toThrow('is not an address');
  });

  it('refuses an answer whose declared length is oversized without reading it', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('tiny', { status: 200, headers: { 'content-length': '9999999' } })
    );
    const { context } = createHarness(spec);

    await expect(runFetch(context, step)).rejects.toThrow('more than');
  });

  it('rejects a JSON content type whose body does not parse', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{broken', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const { context } = createHarness(spec);

    await expect(runFetch(context, step)).rejects.toThrow('said it answered JSON but did not');
  });

  it('renders a string body as a template without forcing a content type', async () => {
    const textual: FetchStep = {
      name: 'notify',
      fetch: { url: 'https://api.example.com/hook', body: 'user={{subscriber.externalId}}' },
    };
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    const { context } = createHarness({ ...spec, steps: [textual] });

    await runFetch(context, textual);

    const [, init] = fetchMock.mock.calls[0]!;
    expect(String((init as RequestInit).body)).toBe('user=user_1');
    expect(
      new Headers(((init as RequestInit).headers ?? {}) as Record<string, string>).get('content-type')
    ).toBeNull();
  });

  it('fails a dry run whose assumed status is unexpected', async () => {
    const context = createDryRunContext(spec, { assume: { notify: { status: 500 } } });

    await expect(runFetch(context, step)).rejects.toThrow('answered 500');
  });
});
