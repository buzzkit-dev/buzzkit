import { recordSystemEvents, type SystemEvent } from '@buzzkit/api/api/events/index';
import {
  ExternalIdParamsSchema,
  ExternalIdSchema,
  findSubscriberByExternalId,
  linkSubscriberAlias,
  listSubscriberAliases,
  serializeSubscriberAlias,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const subscriberAliases = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Subscribers'] } })
  .get(
    '/subscribers/:externalId/aliases',
    async ({ db, params, tenant }) => {
      const target = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const aliases = await listSubscriberAliases(db, tenant.id, target.id);
      return Response.list(aliases.map(serializeSubscriberAlias)).send();
    },
    { tenant: 'subscribers:read', params: ExternalIdParamsSchema }
  )
  .post(
    '/subscribers/:externalId/aliases',
    async ({ body, db, params, set, tenant }) => {
      const target = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const link = await linkSubscriberAlias(db, tenant.id, {
        subscriber: target,
        alias: body.externalId,
      });

      const recorded: SystemEvent = link.merged
        ? { name: 'subscriber.merged', data: { externalId: link.subscriber.externalId, from: link.alias } }
        : { name: 'subscriber.aliased', data: { externalId: link.subscriber.externalId, alias: link.alias } };
      await recordSystemEvents(tenant.id, link.subscriber, [recorded]);

      const aliases = await listSubscriberAliases(db, tenant.id, link.subscriber.id);
      return Response.list(aliases.map(serializeSubscriberAlias)).status(201).send(set);
    },
    {
      tenant: 'subscribers:write',
      params: ExternalIdParamsSchema,
      body: t.Object({ externalId: ExternalIdSchema }),
    }
  );
