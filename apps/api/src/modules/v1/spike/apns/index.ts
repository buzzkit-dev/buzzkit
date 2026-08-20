import { Response } from '@buzzkit/api/libs/response';
import { type ApnsEnvironment, createApnsJwt, probeApns, sendApns } from '@buzzkit/api/providers/apns/index';
import Elysia, { t } from 'elysia';

/**
 * Phase 0 spike endpoint — REMOVE in Phase 4 when the real delivery layer lands.
 *
 * Without a body: unauthenticated HTTP/2 reachability probe against APNs.
 * With credentials: signs a real provider JWT and delivers a real push,
 * verifying the full path (p8 → ES256 JWT → APNs → device).
 */
export const apnsSpike = new Elysia().post(
  '/spike/apns',
  async ({ body, set }) => {
    if (!body?.p8) {
      const probe = await probeApns(body?.environment ?? 'sandbox');
      return Response.success({ mode: 'probe', ...probe }).send(set);
    }

    if (!body.teamId || !body.keyId || !body.bundleId || !body.deviceToken) {
      return Response.error({
        error: {
          code: 'BAD_REQUEST',
          message: 'Sending requires p8, teamId, keyId, bundleId, and deviceToken',
        },
      })
        .status(400)
        .send(set);
    }

    const jwt = await createApnsJwt({ p8: body.p8, teamId: body.teamId, keyId: body.keyId });
    const result = await sendApns({
      jwt,
      deviceToken: body.deviceToken,
      bundleId: body.bundleId,
      environment: body.environment ?? 'sandbox',
      payload: {
        aps: {
          alert: { title: body.title ?? 'buzzkit', body: body.body ?? 'Phase 0 spike — it works.' },
        },
      },
    });

    return Response.success({ mode: 'send', ...result }).send(set);
  },
  {
    body: t.Optional(
      t.Object({
        p8: t.Optional(t.String()),
        teamId: t.Optional(t.String()),
        keyId: t.Optional(t.String()),
        bundleId: t.Optional(t.String()),
        deviceToken: t.Optional(t.String()),
        environment: t.Optional(t.Union([t.Literal('sandbox'), t.Literal('production')])),
        title: t.Optional(t.String()),
        body: t.Optional(t.String()),
      })
    ),
    detail: { tags: ['Spike'] },
  }
);

export type { ApnsEnvironment };
