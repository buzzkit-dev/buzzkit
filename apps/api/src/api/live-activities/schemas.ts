import { t } from 'elysia';

export const LiveActivityTokenSchema = t.String({ minLength: 32, maxLength: 512, pattern: '^[0-9a-fA-F]+$' });

export const RegisterLiveActivitySchema = t.Object({
  kind: t.Optional(t.Union([t.Literal('activity'), t.Literal('start')])),
  activityId: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
  attributesType: t.String({ minLength: 1, maxLength: 128 }),
  token: LiveActivityTokenSchema,
  environment: t.Optional(t.Union([t.Literal('production'), t.Literal('sandbox')])),
});

export const SendLiveActivitySchema = t.Object({
  to: t.String({ minLength: 1, maxLength: 256 }),
  event: t.Union([t.Literal('start'), t.Literal('update'), t.Literal('end')]),
  activityId: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
  attributesType: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
  contentState: t.Record(t.String(), t.Any()),
  attributes: t.Optional(t.Record(t.String(), t.Any())),
  alert: t.Optional(
    t.Object({
      title: t.Optional(t.String({ maxLength: 500 })),
      body: t.Optional(t.String({ maxLength: 4000 })),
      sound: t.Optional(t.String({ maxLength: 100 })),
    })
  ),
  staleDate: t.Optional(t.String({ maxLength: 40 })),
  dismissalDate: t.Optional(t.String({ maxLength: 40 })),
  priority: t.Optional(t.Union([t.Literal('high'), t.Literal('normal')])),
  timestamp: t.Optional(t.Integer({ minimum: 0 })),
});
