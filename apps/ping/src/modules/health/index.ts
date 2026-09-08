import Elysia from 'elysia';

export const health = new Elysia().get('/health', () => ({ ok: true, status: 'healthy' }));
