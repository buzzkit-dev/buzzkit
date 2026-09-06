import { literalUnion } from '@buzzkit/api/libs/schemas';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import { t } from 'elysia';
import { DELIVERY_STATUSES } from './constants';

export const ListMessageDeliveriesQuerySchema = t.Object({
  ...PaginationQuerySchema.properties,
  status: t.Optional(literalUnion(DELIVERY_STATUSES)),
});
