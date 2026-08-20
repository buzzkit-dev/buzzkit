import { createInstrument, createTraceRunner, getActiveSpan, type Span } from '@buzzkit/observability';
import { Elysia } from 'elysia';

export type { Span };

export const trace = createTraceRunner('buzzkit');

export const instrument = createInstrument({
  fetch: 'buzzkit-api',
  queue: 'buzzkit-queue',
  scheduled: 'buzzkit-scheduler',
});

type AuthAttributes = {
  user?: { id: string } | null;
  workspace?: { id: number } | null;
  tenant?: { id: number } | null;
  apiKey?: { id: number; kind: string } | null;
  membership?: { role: string } | null;
};

export function setAuthSpanAttributes(auth: AuthAttributes): void {
  const span = getActiveSpan();
  if (!span) return;

  span.setAttribute('auth.method', auth.apiKey ? `${auth.apiKey.kind}_key` : 'session');
  if (auth.user) span.setAttribute('user.id', auth.user.id);
  if (auth.workspace) span.setAttribute('workspace.id', auth.workspace.id);
  if (auth.tenant) span.setAttribute('tenant.id', auth.tenant.id);
  if (auth.apiKey) span.setAttribute('api_key.id', auth.apiKey.id);
  if (auth.membership) span.setAttribute('membership.role', auth.membership.role);
}

export const telemetry = new Elysia({ name: 'telemetry' })
  .onRequest(({ request }) => {
    const span = getActiveSpan();
    if (!span) return;

    span.setAttribute('http.method', request.method);
    span.setAttribute('url.path', new URL(request.url).pathname);
    const ray = request.headers.get('cf-ray');
    if (ray) span.setAttribute('request.id', ray);
  })
  .onAfterHandle({ as: 'global' }, ({ route, set }) => {
    const span = getActiveSpan();
    if (!span) return;

    span.setAttribute('http.route', route);
    if (set.status !== undefined) span.setAttribute('http.status_code', String(set.status));
  })
  .onError({ as: 'global' }, ({ error, route, set }) => {
    const span = getActiveSpan();
    if (!span) return;

    span.recordException(error as Error);
    span.setAttribute('error', true);
    if (route) span.setAttribute('http.route', route);
    if (set.status !== undefined) span.setAttribute('http.status_code', String(set.status));
  });
