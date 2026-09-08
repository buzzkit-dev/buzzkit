import { resolveDeviceId } from '@buzzkit/ping/api/keys/index';
import { handleRpc } from '@buzzkit/ping/api/mcp/index';
import Elysia from 'elysia';

export const mcp = new Elysia().post(
  '/:key/mcp',
  async ({ body, params, set }) => {
    const deviceId = await resolveDeviceId(params.key);
    const response = await handleRpc(deviceId, body);

    if (!response) {
      set.status = 202;
      return null;
    }

    return response;
  },
  {
    parse: async ({ request }) => {
      const text = await request.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    },
  }
);
