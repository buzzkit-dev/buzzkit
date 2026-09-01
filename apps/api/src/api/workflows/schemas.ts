import { NameSchema, SlugSchema } from '@buzzkit/api/libs/schemas';
import { t } from 'elysia';

export const AssumptionSchema = t.Object(
  {
    matched: t.Optional(t.Boolean()),
    data: t.Optional(t.Unknown()),
    status: t.Optional(t.Integer({ minimum: 100, maximum: 599 })),
  },
  { additionalProperties: false }
);

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

export const WorkflowSlugParamsSchema = t.Object({ workflowSlug: SlugSchema });
