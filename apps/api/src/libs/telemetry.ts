import {
  createActorInstrument,
  createInstrument,
  createTraceRunner,
  currentSpan,
  recordRequestId,
  type Span,
} from '@buzzkit/observability';
import { Elysia } from 'elysia';

export {
  activeTraceId,
  currentTraceparent,
  flushSpans,
  runInvocation,
  withTraceparent,
} from '@buzzkit/observability';

export type { Span };

export const trace = createTraceRunner('buzzkit');

export const instrument = createInstrument({
  fetch: 'buzzkit-api',
  queue: 'buzzkit-queue',
  scheduled: 'buzzkit-scheduler',
});

export const instrumentActor = createActorInstrument('buzzkit-actor');

type AuthAttributes = {
  user?: { id: string } | null;
  workspace?: { id: number } | null;
  tenant?: { id: number } | null;
  apiKey?: { id: number; kind: string } | null;
  membership?: { role: string } | null;
};

export function applyAuthSpanAttributes(auth: AuthAttributes): void {
  const span = currentSpan();
  if (!span) return;

  span.setAttribute('auth.method', auth.apiKey ? `${auth.apiKey.kind}_key` : 'session');
  if (auth.user) span.setAttribute('user.id', auth.user.id);
  if (auth.workspace) span.setAttribute('workspace.id', auth.workspace.id);
  if (auth.tenant) span.setAttribute('tenant.id', auth.tenant.id);
  if (auth.apiKey) span.setAttribute('api_key.id', auth.apiKey.id);
  if (auth.membership) span.setAttribute('membership.role', auth.membership.role);
}

export const telemetry = new Elysia({ name: 'telemetry' })
  .onRequest(({ request, set }) => {
    const requestId = request.headers.get('cf-ray') ?? crypto.randomUUID();
    set.headers['request-id'] = requestId;
    recordRequestId(requestId);

    const span = currentSpan();
    if (!span) return;

    span.setAttribute('http.method', request.method);
    span.setAttribute('url.path', new URL(request.url).pathname);
    span.setAttribute('request.id', requestId);
  })
  .onAfterHandle({ as: 'global' }, ({ route, set }) => {
    const span = currentSpan();
    if (!span) return;

    span.setAttribute('http.route', route);
    if (set.status !== undefined) span.setAttribute('http.status_code', String(set.status));
  })
  .onError({ as: 'global' }, ({ error, route, set }) => {
    const span = currentSpan();
    if (!span) return;

    span.recordException(error as Error);
    span.setAttribute('error', true);
    if (route) span.setAttribute('http.route', route);
    if (set.status !== undefined) span.setAttribute('http.status_code', String(set.status));
  });
