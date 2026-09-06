import type { KeyKind } from '../resources/common';
import { ConfigurationError } from './errors';

const KEY_PREFIXES: Record<string, KeyKind> = {
  bk_ws_: 'workspace',
  bk_tn_: 'tenant',
  bk_pk_: 'client',
};

function resolveKeyKind(apiKey: string): KeyKind | null {
  for (const [prefix, kind] of Object.entries(KEY_PREFIXES)) {
    if (apiKey.startsWith(prefix)) return kind;
  }
  return null;
}

export function assertServerKey(apiKey: string): void {
  if (resolveKeyKind(apiKey) !== 'client') return;

  throw new ConfigurationError(
    'A client key (bk_pk_) cannot be used with the server client — it only reaches /v1/client/*. Use a workspace (bk_ws_) or tenant (bk_tn_) key here, or import buzzkit/client.'
  );
}

export function assertClientKey(apiKey: string): void {
  const kind = resolveKeyKind(apiKey);
  if (kind !== 'workspace' && kind !== 'tenant') return;

  throw new ConfigurationError(
    'A workspace or tenant key grants access to the whole tenant and must never reach a browser. Use a client key (bk_pk_) with buzzkit/client.'
  );
}
