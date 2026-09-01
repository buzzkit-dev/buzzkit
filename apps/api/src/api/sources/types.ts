import type { tables } from '@buzzkit/database';

export type Source = typeof tables.source.$inferSelect;

export type SourceDelivery = typeof tables.sourceDelivery.$inferSelect;

export type IngestResult = { status: 200 | 401; delivery: SourceDelivery };
