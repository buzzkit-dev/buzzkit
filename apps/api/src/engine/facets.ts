import { listPreferences } from '@buzzkit/api/api/topics/index';
import { stepDb } from '@buzzkit/api/libs/database';
import { and, eq, isNull, tables } from '@buzzkit/database';
import type { RunContext } from './context';

export async function applySubscriberFacets(context: RunContext): Promise<void> {
  if (!context.needsSubscriberFacets) return;
  const facets = await context.do('subscriber:facets', async () => {
    if (!context.hasSubscriber) {
      return { channels: {} as Record<string, boolean>, topics: {} as Record<string, boolean> };
    }
    const db = stepDb();
    const rows = await db
      .selectDistinct({ channel: tables.subscription.channel })
      .from(tables.subscription)
      .where(
        and(
          eq(tables.subscription.tenantId, context.params.tenantId),
          eq(tables.subscription.subscriberId, context.params.subscriberId),
          eq(tables.subscription.enabled, true),
          eq(tables.subscription.status, 'active'),
          isNull(tables.subscription.deletedAt)
        )
      );
    const channels: Record<string, boolean> = {};
    for (const row of rows) channels[row.channel] = true;
    const preferences = await listPreferences(db, context.params.tenantId, context.params.subscriberId);
    const topics: Record<string, boolean> = {};
    for (const preference of preferences) {
      topics[preference.slug] = Object.values(preference.channels).some((entry) => entry?.optedIn === true);
    }

    return { channels, topics };
  });
  context.applyFacets(facets);
}
