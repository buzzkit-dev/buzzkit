type Recorded = {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
};

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'content-type': 'application/json' },
  });
}

export function startStub(port: number) {
  const recorded: Recorded[] = [];
  const withoutActivities = new Set<string>();

  const server = Bun.serve({
    port,
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === '/__recorded') {
        if (request.method === 'DELETE') {
          recorded.length = 0;
          return envelope({ cleared: true });
        }
        return new Response(JSON.stringify(recorded), {
          headers: { 'content-type': 'application/json' },
        });
      }

      const raw = await request.text();
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;

      if (path === '/__without-activities') {
        withoutActivities.add(String(body?.externalId));
        return envelope({ ok: true });
      }

      recorded.push({ method: request.method, path, body });

      if (path === '/v1/messages') {
        return envelope({ id: `msg_${recorded.length}`, status: 'queued' });
      }
      if (path === '/v1/live-activities/send') {
        if (withoutActivities.has(String(body?.to))) {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: 'not_found', message: 'No push-to-start token registered' },
            }),
            { status: 404, headers: { 'content-type': 'application/json' } }
          );
        }
        return envelope({ results: [{ id: `la_${recorded.length}`, ok: true }] });
      }
      if (path.startsWith('/v1/subscribers/')) {
        return envelope({ id: recorded.length, externalId: decodeURIComponent(path.split('/')[3] ?? '') });
      }

      return envelope({});
    },
  });

  return server;
}
