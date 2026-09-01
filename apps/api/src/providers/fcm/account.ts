export type FcmServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

export function parseServiceAccount(input: unknown): FcmServiceAccount | null {
  const value = typeof input === 'string' ? safeJsonParse(input) : input;
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  if (
    typeof record.project_id !== 'string' ||
    typeof record.client_email !== 'string' ||
    typeof record.private_key !== 'string'
  ) {
    return null;
  }

  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(record.project_id)) return null;

  return {
    project_id: record.project_id,
    client_email: record.client_email,
    private_key: record.private_key,
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
