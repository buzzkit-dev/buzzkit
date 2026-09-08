import { env } from 'cloudflare:workers';

export function resolveOrigin(request: Request): string {
  return env.PING_URL ?? new URL(request.url).origin;
}
