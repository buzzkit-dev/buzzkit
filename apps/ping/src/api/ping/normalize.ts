import { BadRequestError } from '@buzzkit/ping/libs/error';
import type { PingBodySchema } from './schemas';
import type { PingInput } from './types';

export function normalizePing(body: string | typeof PingBodySchema.static): PingInput {
  if (typeof body === 'string') {
    return blankPing({ title: body.trim() });
  }

  if (!body.title) {
    throw new BadRequestError('A ping needs a title', { code: 'title_missing', param: 'title' });
  }

  return {
    title: body.title,
    body: body.body ?? null,
    session: body.session ?? null,
    status: body.status ?? (body.session ? 'working' : null),
    progress: body.progress ?? null,
    step: body.step ?? null,
    agent: body.agent ?? null,
    project: body.project ?? null,
    avatar: body.avatar ?? null,
    url: body.url ?? null,
    silent: body.silent ?? false,
    important: body.important ?? false,
    ttlSeconds: body.ttl ?? null,
    custom: body.custom ?? null,
  };
}

function blankPing(overrides: Partial<PingInput>): PingInput {
  return {
    title: null,
    body: null,
    session: null,
    status: null,
    progress: null,
    step: null,
    agent: null,
    project: null,
    avatar: null,
    url: null,
    silent: false,
    important: false,
    ttlSeconds: null,
    custom: null,
    ...overrides,
  };
}
