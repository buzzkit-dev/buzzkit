import { createServer, type Server } from 'node:http';
import { FETCH_BODY_EXCERPT_CHARS, timedFetch } from '@buzzkit/api/libs/http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/slow') {
      setTimeout(() => {
        response.writeHead(200).end('late');
      }, 2000);
      return;
    }
    if (request.url === '/huge') {
      response.writeHead(200).end('x'.repeat(FETCH_BODY_EXCERPT_CHARS + 500));
      return;
    }
    response.writeHead(201, { 'content-type': 'application/json' }).end('{"ok":true}');
  });
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe('timedFetch', () => {
  it('returns the response, a body excerpt and the latency on success', async () => {
    const result = await timedFetch(`${baseUrl}/ok`, { method: 'POST' }, 5000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.status).toBe(201);
      expect(result.bodyExcerpt).toBe('{"ok":true}');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      await expect(result.response.text()).resolves.toBe('{"ok":true}');
    }
  });

  it('caps the excerpt at FETCH_BODY_EXCERPT_CHARS', async () => {
    const result = await timedFetch(`${baseUrl}/huge`, {}, 5000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bodyExcerpt).toHaveLength(FETCH_BODY_EXCERPT_CHARS);
  });

  it('classifies a timeout distinctly from a connection failure', async () => {
    const timedOut = await timedFetch(`${baseUrl}/slow`, {}, 200);
    expect(timedOut.ok).toBe(false);
    if (!timedOut.ok) {
      expect(timedOut.timedOut).toBe(true);
      expect(timedOut.reason).toContain('200ms');
    }

    const refused = await timedFetch('http://127.0.0.1:1/nope', {}, 2000);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.timedOut).toBe(false);
  });
});
