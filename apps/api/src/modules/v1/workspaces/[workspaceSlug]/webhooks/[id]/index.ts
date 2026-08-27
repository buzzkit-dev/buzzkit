import { env } from 'cloudflare:workers';
import { diffForEvent } from '@buzzkit/api/api/audit/index';
import { findTenantBySlug } from '@buzzkit/api/api/tenants/index';
import {
  findEndpoint,
  listRetryableDeliveryIds,
  serializeEndpoint,
  softDeleteEndpoint,
  updateEndpoint,
  WebhookEventsSchema,
} from '@buzzkit/api/api/webhooks/index';
import { REENABLE_RETRY_LIMIT } from '@buzzkit/api/api/webhooks/policy';
import { auth } from '@buzzkit/api/libs/auth';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import { SlugSchema, UrlSchema } from '@buzzkit/api/libs/schemas';
import Elysia, { t } from 'elysia';

export const webhook = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Webhooks'] } })
  .get(
    '/workspaces/:workspaceSlug/webhooks/:id',
    async ({ db, params, workspace }) => {
      const endpoint = await findEndpoint(db, workspace.id, params.id);
      return Response.success(serializeEndpoint(endpoint, { secret: true })).send();
    },
    { scope: 'webhooks:read' }
  )
  .patch(
    '/workspaces/:workspaceSlug/webhooks/:id',
    async ({ audit, body, db, params, workspace }) => {
      if (Object.keys(body).length === 0) throw new BadRequestError('Nothing to update');
      const existing = await findEndpoint(db, workspace.id, params.id);
      const tenantId =
        body.tenant === undefined
          ? undefined
          : body.tenant === null
            ? null
            : (await findTenantBySlug(db, workspace.id, body.tenant)).id;
      const updated = await updateEndpoint(db, existing, {
        url: body.url,
        description: body.description,
        events: body.events,
        tenantId,
        enabled: body.enabled,
      });

      if (existing.disabledAt !== null && updated.disabledAt === null) {
        for (const deliveryId of await listRetryableDeliveryIds(db, existing.id, REENABLE_RETRY_LIMIT)) {
          await env.WEBHOOKS.send({ kind: 'deliver', deliveryId });
        }
      }

      const { changes, previousAttributes } = diffForEvent(existing, updated, [
        'updatedAt',
        'secret',
        'previousSecret',
      ]);
      if (changes.length > 0) {
        await audit({
          event: 'webhook.updated',
          target: { type: 'webhook', id: existing.id },
          data: { changes, previousAttributes, url: updated.url },
        });
      }

      return Response.success(serializeEndpoint(updated, { secret: true })).send();
    },
    {
      scope: 'webhooks:write',
      body: t.Object({
        url: t.Optional(UrlSchema),
        description: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
        events: t.Optional(WebhookEventsSchema),
        tenant: t.Optional(t.Union([SlugSchema, t.Null()])),
        enabled: t.Optional(t.Boolean()),
      }),
    }
  )
  .delete(
    '/workspaces/:workspaceSlug/webhooks/:id',
    async ({ audit, db, params, workspace }) => {
      const existing = await findEndpoint(db, workspace.id, params.id);
      const deleted = await softDeleteEndpoint(db, existing.id);

      await audit({
        event: 'webhook.deleted',
        target: { type: 'webhook', id: existing.id },
        data: { url: existing.url },
      });

      return Response.success(markDeleted(serializeEndpoint(deleted))).send();
    },
    { scope: 'webhooks:write' }
  );
