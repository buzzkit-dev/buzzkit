import { tables } from '@buzzkit/database';
import type { DeliveryStatus } from './types';

export const DELIVERY_STATUSES = tables.delivery.status.enumValues;

export const UNSETTLED_STATUSES: DeliveryStatus[] = ['pending', 'retrying'];
