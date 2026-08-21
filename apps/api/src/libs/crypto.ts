import { env } from 'cloudflare:workers';
import { fromBase64, toBase64, toHex } from './encoding';
import { InternalError } from './error';

export const MASTER_KEY_BYTES = 32;

type Secrets = { CREDENTIAL_MASTER_KEYS?: string; CREDENTIAL_MASTER_KEY_VERSION?: string };

const secrets = () => env as unknown as Secrets;

export function currentKeyVersion(): number {
  const version = Number(secrets().CREDENTIAL_MASTER_KEY_VERSION ?? '1');
  if (!Number.isInteger(version) || version < 1) {
    throw new InternalError('CREDENTIAL_MASTER_KEY_VERSION must be a positive integer');
  }
  return version;
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

function masterKeyMaterial(version: number): Uint8Array {
  const configured = secrets().CREDENTIAL_MASTER_KEYS;
  const keys: Record<string, string> = configured ? JSON.parse(configured) : {};
  const raw = keys[String(version)] ?? (version === 1 ? env.CREDENTIAL_MASTER_KEY : undefined);
  if (!raw) {
    throw new InternalError(`Credential master key v${version} is not configured`);
  }

  const bytes = fromBase64(raw);
  if (bytes.byteLength !== MASTER_KEY_BYTES) {
    throw new InternalError(`Credential master key v${version} must be ${MASTER_KEY_BYTES} bytes`);
  }
  return bytes;
}

async function masterKey(version: number): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    masterKeyMaterial(version) as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

const aadFor = (context: string, keyVersion: number): BufferSource =>
  new TextEncoder().encode(`${context}:k${keyVersion}`) as BufferSource;

export async function sealSecret(plaintext: string, context: string): Promise<SealedSecret> {
  const keyVersion = currentKeyVersion();
  const aad = aadFor(context, keyVersion);
  const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

  const secretIv = crypto.getRandomValues(new Uint8Array(12));
  const secretCiphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: secretIv as BufferSource, additionalData: aad },
    dek,
    new TextEncoder().encode(plaintext)
  );

  const dekRaw = await crypto.subtle.exportKey('raw', dek);
  const dekIv = crypto.getRandomValues(new Uint8Array(12));
  const dekCiphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: dekIv as BufferSource, additionalData: aad },
    await masterKey(keyVersion),
    dekRaw
  );

  return {
    secretCiphertext: toBase64(secretCiphertext),
    secretIv: toBase64(secretIv),
    dekCiphertext: toBase64(dekCiphertext),
    dekIv: toBase64(dekIv),
    keyVersion,
  };
}

export async function unsealSecret(sealed: SealedSecret, context: string): Promise<string> {
  const aad = aadFor(context, sealed.keyVersion);
  const dekRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.dekIv) as BufferSource, additionalData: aad },
    await masterKey(sealed.keyVersion),
    fromBase64(sealed.dekCiphertext) as BufferSource
  );

  const dek = await crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, false, ['decrypt']);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.secretIv) as BufferSource, additionalData: aad },
    dek,
    fromBase64(sealed.secretCiphertext) as BufferSource
  );

  return new TextDecoder().decode(plaintext);
}
