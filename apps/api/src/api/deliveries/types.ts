import type { tables } from '@buzzkit/database';

export type Delivery = typeof tables.delivery.$inferSelect;

export type DeliveryAttempt = typeof tables.deliveryAttempt.$inferSelect;

export type DeliveryStatus = Delivery['status'];

export type MessageDeliveryRow = {
  delivery: Delivery;
  externalId: string;
  platform: string | null;
  endpoint: string | null;
};

export type SubscriberDeliveryRow = { delivery: Delivery; message: typeof tables.message.$inferSelect };
