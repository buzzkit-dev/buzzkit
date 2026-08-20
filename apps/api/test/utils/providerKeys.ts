function derToPem(der: ArrayBuffer, newlineEscaped: boolean): string {
  const base64 = Buffer.from(der).toString('base64');
  const lines = base64.match(/.{1,64}/g) ?? [];
  const body = lines.join(newlineEscaped ? '\\n' : '\n');
  const nl = newlineEscaped ? '\\n' : '\n';
  return `-----BEGIN PRIVATE KEY-----${nl}${body}${nl}-----END PRIVATE KEY-----${nl}`;
}

/** A structurally valid (but unregistered) APNs .p8 — real P-256 PKCS#8 PEM. */
export async function generateP8(): Promise<string> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const der = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return derToPem(der, false);
}

/** A structurally valid (but unregistered) Firebase service account JSON. */
export async function generateServiceAccount(projectId: string) {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign']
  );
  const der = await crypto.subtle.exportKey('pkcs8', pair.privateKey);

  return {
    type: 'service_account',
    project_id: projectId,
    client_email: `buzzkit-test@${projectId}.iam.gserviceaccount.com`,
    private_key: derToPem(der, false),
  };
}
