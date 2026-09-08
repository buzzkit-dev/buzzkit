import { t } from 'elysia';

export const PingBodySchema = t.Object({
  title: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  body: t.Optional(t.String({ maxLength: 2000 })),
  session: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
  status: t.Optional(
    t.Union([t.Literal('working'), t.Literal('waiting'), t.Literal('done'), t.Literal('failed')])
  ),
  progress: t.Optional(t.Number({ minimum: 0, maximum: 1 })),
  step: t.Optional(
    t.Object({ current: t.Integer({ minimum: 0 }), total: t.Integer({ minimum: 1, maximum: 10_000 }) })
  ),
  agent: t.Optional(t.String({ maxLength: 60 })),
  project: t.Optional(t.String({ maxLength: 80 })),
  avatar: t.Optional(t.String({ maxLength: 500 })),
  url: t.Optional(t.String({ maxLength: 500 })),
  silent: t.Optional(t.Boolean()),
  ttl: t.Optional(t.Integer({ minimum: 60, maximum: 86_400 })),
  custom: t.Optional(t.Record(t.String(), t.Any())),
});

export const PingSchema = t.Union([t.String({ minLength: 1, maxLength: 200 }), PingBodySchema]);
