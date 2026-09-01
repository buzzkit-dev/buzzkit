import { parseServiceAccount } from '@buzzkit/api/providers/fcm/index';
import { describe, expect, it } from 'vitest';

const account = {
  project_id: 'my-project-123',
  client_email: 'svc@my-project-123.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
};

describe('parseServiceAccount', () => {
  it('accepts an object and a JSON string', () => {
    expect(parseServiceAccount(account)).toEqual(account);
    expect(parseServiceAccount(JSON.stringify(account))).toEqual(account);
  });

  it('drops extra fields and keeps only the three used ones', () => {
    expect(parseServiceAccount({ ...account, type: 'service_account', token_uri: 'x' })).toEqual(account);
  });

  it('rejects malformed JSON, non-objects, and missing fields', () => {
    expect(parseServiceAccount('{not json')).toBeNull();
    expect(parseServiceAccount(null)).toBeNull();
    expect(parseServiceAccount(42)).toBeNull();
    expect(parseServiceAccount({ project_id: 'my-project-123' })).toBeNull();
    expect(parseServiceAccount({ ...account, private_key: 7 })).toBeNull();
  });

  it('rejects project ids outside the GCP grammar', () => {
    expect(parseServiceAccount({ ...account, project_id: 'Bad_Project' })).toBeNull();
    expect(parseServiceAccount({ ...account, project_id: 'ab' })).toBeNull();
    expect(parseServiceAccount({ ...account, project_id: 'ends-with-dash-' })).toBeNull();
  });
});
