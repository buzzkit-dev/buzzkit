import { health } from '@buzzkit/api/modules/v1/health/index';
import Elysia from 'elysia';

export const v1 = new Elysia({ prefix: '/v1' }).use(health);
