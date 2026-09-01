import { findTenantBySlug } from '@buzzkit/api/api/tenants/index';
import {
  createEndpoint,
  listEndpoints,
  serializeEndpoint,
  WebhookEventsSchema,
} from '@buzzkit/api/api/webhooks/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { SlugSchema, UrlSchema } from '@buzzkit/api/libs/schemas';
import Elysia, { t } from 'elysia';

export const webhooks = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Webhooks'] } })
  .get(
    '/workspaces/:workspaceSlug/webhooks',
    async ({ db, workspace }) => {
      const endpoints = await listEndpoints(db, workspace.id);
      return Response.list(endpoints.map((endpoint) => serializeEndpoint(endpoint))).send();
    },
    { scope: 'webhooks:read' }
  )
  .post(
    '/workspaces/:workspaceSlug/webhooks',
    async ({ audit, body, db, set, user, workspace }) => {
      let tenant: Awaited<ReturnType<typeof findTenantBySlug>> | null = null;
      if (body.tenant) tenant = await findTenantBySlug(db, workspace.id, body.tenant);

      const endpoint = await createEndpoint(
        db,
        workspace.id,
        { url: body.url, description: body.description, events: body.events, tenantId: tenant?.id ?? null },
        user?.id ?? null
      );

      await audit({
        event: 'webhook.created',
        target: { type: 'webhook', id: endpoint.id },
        data: { url: endpoint.url, events: endpoint.events },
      });

      return Response.success(serializeEndpoint(endpoint, { secret: true }))
        .status(201)
        .send(set);
    },
    {
      scope: 'webhooks:write',
      body: t.Object({
        url: UrlSchema,
        description: t.Optional(t.String({ maxLength: 500 })),
        events: t.Optional(WebhookEventsSchema),
        tenant: t.Optional(SlugSchema),
      }),
    }
  );
