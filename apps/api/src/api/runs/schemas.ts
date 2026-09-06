import { literalUnion, SlugSchema } from '@buzzkit/api/libs/schemas';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import { t } from 'elysia';
import { RUN_STATUSES } from './constants';

export const ListRunsQuerySchema = t.Object({
  ...PaginationQuerySchema.properties,
  status: t.Optional(literalUnion(RUN_STATUSES)),
  workflow: t.Optional(SlugSchema),
});

export const ListWorkflowRunsQuerySchema = t.Object({
  ...PaginationQuerySchema.properties,
  status: t.Optional(literalUnion(RUN_STATUSES)),
});
