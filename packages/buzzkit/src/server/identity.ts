const encoder = new TextEncoder();

function toHex(signature: ArrayBuffer): string {
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function signIdentity(externalId: string, identitySecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(identitySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(externalId)));
}
