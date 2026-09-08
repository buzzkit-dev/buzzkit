import { env } from 'cloudflare:workers';
import Elysia from 'elysia';

export const home = new Elysia().get('/', ({ redirect }) => redirect(env.BUZZ_URL, 302));
