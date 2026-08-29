import { NameSchema, SlugSchema } from '@buzzkit/api/libs/schemas';
import { t } from 'elysia';

export const CreateWorkflowSchema = t.Object({
  slug: SlugSchema,
  name: NameSchema,
  description: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
  spec: t.Unknown(),
});

export const UpdateWorkflowSchema = t.Object({
  name: t.Optional(NameSchema),
  description: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
  spec: t.Optional(t.Unknown()),
});
