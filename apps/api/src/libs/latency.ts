import { env } from 'cloudflare:workers';
import Elysia from 'elysia';

function resolveSimulatedDelay(): number {
  if (env.ENVIRONMENT !== 'development') return 0;
  const setting = env.SIMULATED_LATENCY_MS?.trim();
  if (!setting) return 0;

  const bounds = setting.split('-').map((part) => Number.parseInt(part.trim(), 10));
  const [from] = bounds;
  if (from === undefined || Number.isNaN(from)) return 0;

  const to = bounds[1] !== undefined && !Number.isNaN(bounds[1]) ? bounds[1] : from;
  return from + Math.random() * Math.max(0, to - from);
}

export const latency = new Elysia({ name: 'latency' }).onRequest(async () => {
  const delay = resolveSimulatedDelay();
  if (delay > 0) await new Promise((done) => setTimeout(done, delay));
});
