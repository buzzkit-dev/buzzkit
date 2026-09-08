import { resolveDeviceId } from '@buzzkit/ping/api/keys/index';
import { renderSkill } from '@buzzkit/ping/api/skill/index';
import { resolveOrigin } from '@buzzkit/ping/libs/origin';
import Elysia from 'elysia';

const MARKDOWN = { 'content-type': 'text/markdown; charset=utf-8' };

export const skill = new Elysia()
  .get(
    '/skill.md',
    ({ request }) => new Response(renderSkill(null, resolveOrigin(request)), { headers: MARKDOWN })
  )
  .get('/:key/skill.md', async ({ params, request }) => {
    await resolveDeviceId(params.key);
    return new Response(renderSkill(params.key, resolveOrigin(request)), { headers: MARKDOWN });
  });
