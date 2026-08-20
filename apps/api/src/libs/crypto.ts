import { env } from 'cloudflare:workers';
import { InternalError } from './error';

export const CREDENTIAL_KEY_VERSION = 1;

export type SealedSecret = {
  secretCiphertext: string;
  secretIv: string;
  dekCiphertext: string;
  dekIv: string;
  keyVersion: number;
};

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function masterKey(): Promise<CryptoKey> {
  const raw = env.CREDENTIAL_MASTER_KEY;
  if (!raw) {
    throw new InternalError('CREDENTIAL_MASTER_KEY is not configured');
  }

  return crypto.subtle.importKey('raw', fromBase64(raw) as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function sealSecret(plaintext: string, context: string): Promise<SealedSecret> {
  const aad = new TextEncoder().encode(context) as BufferSource;
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
    await masterKey(),
    dekRaw
  );

  return {
    secretCiphertext: toBase64(secretCiphertext),
    secretIv: toBase64(secretIv),
    dekCiphertext: toBase64(dekCiphertext),
    dekIv: toBase64(dekIv),
    keyVersion: CREDENTIAL_KEY_VERSION,
  };
}

export async function unsealSecret(sealed: SealedSecret, context: string): Promise<string> {
  const aad = new TextEncoder().encode(context) as BufferSource;
  const dekRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.dekIv) as BufferSource, additionalData: aad },
    await masterKey(),
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
