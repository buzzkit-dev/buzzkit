import { literalUnion } from '@buzzkit/api/libs/schemas';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import { webhookDeliveryStatus } from '@buzzkit/database';
import { t } from 'elysia';

export const WebhookEventsSchema = t.Array(t.String({ minLength: 1, maxLength: 120 }), { maxItems: 100 });

export const WebhookDeliveryStatusSchema = literalUnion(webhookDeliveryStatus.enumValues);

export const ListWebhookDeliveriesQuerySchema = t.Object({
  ...PaginationQuerySchema.properties,
  status: t.Optional(WebhookDeliveryStatusSchema),
});
