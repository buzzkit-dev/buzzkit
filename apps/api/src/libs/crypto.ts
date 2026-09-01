import { env } from 'cloudflare:workers';
import { fromBase64, toBase64, toHex } from './encoding';
import { InternalError } from './error';

export const MASTER_KEY_BYTES = 32;

const MASTER_KEY_PREFIX = 'CREDENTIAL_MASTER_KEY_V';

function masterKeyMaterial(version: number): Uint8Array | null {
  const raw = (env as unknown as Record<string, unknown>)[`${MASTER_KEY_PREFIX}${version}`];
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const bytes = fromBase64(raw);
  if (bytes.byteLength !== MASTER_KEY_BYTES) {
    throw new InternalError(`${MASTER_KEY_PREFIX}${version} must be ${MASTER_KEY_BYTES} bytes`);
  }

  return bytes;
}

export function masterKeyVersions(): number[] {
  const versions: number[] = [];
  for (let version = 1; masterKeyMaterial(version); version++) versions.push(version);
  if (versions.length === 0) throw new InternalError(`${MASTER_KEY_PREFIX}1 is not configured`);
  return versions;
}

export function currentKeyVersion(): number {
  return masterKeyVersions().at(-1) as number;
}

function masterKey(version: number): Promise<CryptoKey> {
  const material = masterKeyMaterial(version);
  if (!material) throw new InternalError(`Credential master key v${version} is not configured`);

  return crypto.subtle.importKey('raw', material as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(digest);
}

export type SealedSecret = {
  secretCiphertext: string;
  secretIv: string;
  dekCiphertext: string;
  dekIv: string;
  keyVersion: number;
};

const encode = (value: string): BufferSource => new TextEncoder().encode(value) as BufferSource;

const secretAad = (context: string): BufferSource => encode(context);

const wrapAad = (context: string, keyVersion: number): BufferSource => encode(`${context}:k${keyVersion}`);

async function wrapDek(dek: CryptoKey, context: string, keyVersion: number) {
  const dekIv = crypto.getRandomValues(new Uint8Array(12));
  const dekCiphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: dekIv as BufferSource, additionalData: wrapAad(context, keyVersion) },
    await masterKey(keyVersion),
    await crypto.subtle.exportKey('raw', dek)
  );
  return { dekCiphertext: toBase64(dekCiphertext), dekIv: toBase64(dekIv), keyVersion };
}

async function unwrapDek(
  sealed: SealedSecret,
  context: string,
  usages: ('encrypt' | 'decrypt')[]
): Promise<CryptoKey> {
  const dekRaw = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(sealed.dekIv) as BufferSource,
      additionalData: wrapAad(context, sealed.keyVersion),
    },
    await masterKey(sealed.keyVersion),
    fromBase64(sealed.dekCiphertext) as BufferSource
  );
  return crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, true, usages);
}

export async function sealSecret(plaintext: string, context: string): Promise<SealedSecret> {
  const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const secretIv = crypto.getRandomValues(new Uint8Array(12));
  const secretCiphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: secretIv as BufferSource, additionalData: secretAad(context) },
    dek,
    encode(plaintext)
  );

  return {
    secretCiphertext: toBase64(secretCiphertext),
    secretIv: toBase64(secretIv),
    ...(await wrapDek(dek, context, currentKeyVersion())),
  };
}

export async function unsealSecret(sealed: SealedSecret, context: string): Promise<string> {
  const dek = await unwrapDek(sealed, context, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.secretIv) as BufferSource, additionalData: secretAad(context) },
    dek,
    fromBase64(sealed.secretCiphertext) as BufferSource
  );
  return new TextDecoder().decode(plaintext);
}

export async function rewrapSecret(sealed: SealedSecret, context: string): Promise<SealedSecret> {
  const dek = await unwrapDek(sealed, context, ['encrypt', 'decrypt']);

  return {
    secretCiphertext: sealed.secretCiphertext,
    secretIv: sealed.secretIv,
    ...(await wrapDek(dek, context, currentKeyVersion())),
  };
}

export function sealingContext(entity: string, ...parts: Array<string | number>): string {
  return [entity, 'v1', ...parts].join(':');
}

export async function rewrapSealedRows<Row>(
  rows: Row[],
  resolve: (row: Row) => { sealed: SealedSecret | null; context: string },
  update: (row: Row, next: Pick<SealedSecret, 'dekCiphertext' | 'dekIv' | 'keyVersion'>) => Promise<void>
): Promise<number> {
  let rewrapped = 0;

  for (const row of rows) {
    const { sealed, context } = resolve(row);
    if (!sealed) continue;

    const next = await rewrapSecret(sealed, context);
    await update(row, { dekCiphertext: next.dekCiphertext, dekIv: next.dekIv, keyVersion: next.keyVersion });
    rewrapped += 1;
  }
  return rewrapped;
}
