import { NameSchema, SlugSchema } from '@buzzkit/api/libs/schemas';
import { type Expression, ExpressionSchema } from 'buzzkit/expressions';
import { t } from 'elysia';

export const SegmentExpressionSchema = t.Unsafe<Expression>(ExpressionSchema);

export const CreateSegmentSchema = t.Object({
  slug: SlugSchema,
  name: NameSchema,
  description: t.Optional(t.String({ maxLength: 500 })),
  expression: SegmentExpressionSchema,
});

export const UpdateSegmentSchema = t.Object({
  name: t.Optional(NameSchema),
  description: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
  expression: t.Optional(SegmentExpressionSchema),
});

export const PreviewSegmentSchema = t.Object({
  expression: SegmentExpressionSchema,
});
