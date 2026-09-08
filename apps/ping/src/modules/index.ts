import { error } from '@buzzkit/ping/libs/error';
import Elysia from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';
import { activity } from './[key]/activity/index';
import { code } from './[key]/code/index';
import { key } from './[key]/index';
import { mcp } from './[key]/mcp/index';
import { presence } from './[key]/presence/index';
import { stream } from './[key]/stream/index';
import { timeline } from './[key]/timeline/index';
import { health } from './health/index';
import { home } from './home/index';
import { pair } from './pair/index';
import { skill } from './skill/index';

export const app = new Elysia({ adapter: CloudflareAdapter })
  .use(error)
  /* / */
  .use(home)
  /* /health */
  .use(health)
  /* /skill.md · /:key/skill.md */
  .use(skill)
  /* /pair · /pair/claim */
  .use(pair)
  /* /:key/activity */
  .use(activity)
  /* /:key/presence */
  .use(presence)
  /* /:key/timeline */
  .use(timeline)
  /* /:key/stream */
  .use(stream)
  /* /:key/code · /:key/rotate */
  .use(code)
  /* /:key/mcp */
  .use(mcp)
  /* /:key */
  .use(key);
