import { resolveDeviceId } from '@buzzkit/ping/api/keys/index';
import { claimPairingCode, createPairing } from '@buzzkit/ping/api/pair/index';
import { device, unwrap } from '@buzzkit/ping/device/index';
import { resolveOrigin } from '@buzzkit/ping/libs/origin';
import Elysia, { t } from 'elysia';

export const pair = new Elysia()
  .post('/pair', async ({ request, set }) => {
    const pairing = await createPairing(request.headers.get('cf-connecting-ip') ?? 'unknown');
    set.status = 201;

    return {
      ok: true,
      key: pairing.key,
      endpoint: `${resolveOrigin(request)}/${pairing.key}`,
      buzzkit: pairing.identity,
    };
  })
  .post(
    '/pair/claim',
    async ({ body, request }) => {
      const key = await claimPairingCode(body.code);
      unwrap(await device(await resolveDeviceId(key)).recordConnection(body.agent ?? null));
      const origin = resolveOrigin(request);

      return { ok: true, key, endpoint: `${origin}/${key}`, mcp: `${origin}/${key}/mcp` };
    },
    {
      body: t.Object({
        code: t.String({ minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }),
        agent: t.Optional(t.String({ maxLength: 64 })),
      }),
    }
  );
