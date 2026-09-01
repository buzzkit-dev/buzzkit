import { sha256Hex } from '@buzzkit/api/libs/crypto';
import { CLIENT_KEY_PREFIX, KIND_PREFIXES, TENANT_KEY_PREFIX, WORKSPACE_KEY_PREFIX } from './constants';
import type { ApiKeyKind } from './types';

export function isApiKeyToken(token: string): boolean {
  return [WORKSPACE_KEY_PREFIX, TENANT_KEY_PREFIX].some((prefix) => token.startsWith(prefix));
}

export function isClientKeyToken(token: string): boolean {
  return token.startsWith(CLIENT_KEY_PREFIX);
}

export function randomString(length: number): string {
  const chars: string[] = [];

  while (chars.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte < 248) {
        chars.push('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[byte % 62] as string);
        if (chars.length === length) break;
      }
    }
  }
  return chars.join('');
}

export function keyKindOf(token: string): ApiKeyKind | null {
  return (
    (Object.keys(KIND_PREFIXES) as ApiKeyKind[]).find((kind) => token.startsWith(KIND_PREFIXES[kind])) ?? null
  );
}

export function generateApiKeySecret(kind: ApiKeyKind): string {
  return `${KIND_PREFIXES[kind]}${randomString(40)}`;
}

export function stripApiKeyPrefix(token: string): string {
  const prefix = [WORKSPACE_KEY_PREFIX, TENANT_KEY_PREFIX, CLIENT_KEY_PREFIX].find((p) =>
    token.startsWith(p)
  );
  return prefix ? token.slice(prefix.length) : token;
}

export function hashApiKeySecret(secret: string): Promise<string> {
  return sha256Hex(secret);
}
