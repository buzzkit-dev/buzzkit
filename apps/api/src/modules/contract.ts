import { v1 } from '@buzzkit/api/modules/v1/index';
import Elysia from 'elysia';

export const api = new Elysia().use(v1);
