import { BadRequestError, describeError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { parseServiceAccount } from '@buzzkit/api/providers/fcm/index';
import { PROVIDERS, type ProviderValidationResult } from '@buzzkit/api/providers/index';
import { type Db, environment as environmentEnum, eq, tables } from '@buzzkit/database';
import type { CredentialUploadInput } from './schemas';
import { decryptCredentialSecret } from './secrets';
import type {
  Credential,
  CredentialEnvironment,
  CredentialProvider,
  CredentialUpload,
  ValidationOutcome,
} from './types';

export function resolveCredentialUpload(input: CredentialUploadInput): CredentialUpload {
  switch (input.provider) {
    case 'apns':
      return {
        provider: 'apns',
        environment: input.environment ?? null,
        secret: input.p8,
        details: { teamId: input.teamId, keyId: input.keyId, bundleId: input.bundleId },
      };
    case 'fcm': {
      const account = parseServiceAccount(input.serviceAccount);
      if (!account) {
        throw new BadRequestError(
          'serviceAccount must be a Firebase service-account JSON with project_id, client_email, and private_key',
          { code: 'invalid_service_account', param: 'serviceAccount' }
        );
      }
      return {
        provider: 'fcm',
        environment: 'production',
        secret: account.private_key,
        details: { projectId: account.project_id, clientEmail: account.client_email },
      };
    }
    case 'resend':
      return { provider: 'resend', environment: 'production', secret: input.apiKey, details: {} };
  }
}

export async function validateCredentialUpload(
  provider: CredentialProvider,
  input: { secret: string; details: Record<string, string>; environment: CredentialEnvironment }
): Promise<ValidationOutcome> {
  const definition = PROVIDERS[provider];
  const result = await trace(
    'credentials.validate',
    { 'credential.provider': provider, 'credential.environment': input.environment },
    async (span) => {
      const outcome = await definition.validate(input);
      span.set('credential.valid', outcome.ok);
      if (!outcome.ok) span.set('credential.code', outcome.code);
      return outcome;
    }
  );

  if (result.ok) {
    return { status: 'active', lastError: null };
  }
  if (result.code === 'transport' || result.code === 'timeout' || result.code === 'provider_unavailable') {
    return { status: 'unvalidated', lastError: `${definition.displayName} unreachable: ${result.reason}` };
  }

  throw new BadRequestError(`${definition.displayName} rejected the credential: ${result.reason}`, {
    code: 'credential_rejected',
  });
}

export async function detectCredentialEnvironments(
  provider: CredentialProvider,
  input: { secret: string; details: Record<string, string> }
): Promise<Array<{ environment: CredentialEnvironment; outcome: ValidationOutcome }>> {
  if (provider !== 'apns') {
    return [
      {
        environment: 'production',
        outcome: await validateCredentialUpload(provider, { ...input, environment: 'production' }),
      },
    ];
  }

  const definition = PROVIDERS[provider];
  const probes = await Promise.all(
    environmentEnum.enumValues.map(async (slot) => {
      return {
        environment: slot,
        result: await trace<ProviderValidationResult>(
          'credentials.validate',
          { 'credential.provider': provider, 'credential.environment': slot },
          async (span) => {
            const outcome = await definition.validate({ ...input, environment: slot });
            span.set('credential.valid', outcome.ok);
            if (!outcome.ok) span.set('credential.code', outcome.code);
            return outcome;
          }
        ),
      };
    })
  );

  const accepted = probes.flatMap(
    ({ environment, result }): Array<{ environment: CredentialEnvironment; outcome: ValidationOutcome }> => {
      if (result.ok) return [{ environment, outcome: { status: 'active', lastError: null } }];
      if (
        result.code === 'transport' ||
        result.code === 'timeout' ||
        result.code === 'provider_unavailable'
      ) {
        return [
          {
            environment,
            outcome: {
              status: 'unvalidated',
              lastError: `${definition.displayName} unreachable: ${result.reason}`,
            },
          },
        ];
      }
      return [];
    }
  );
  if (accepted.length > 0) return accepted;

  const rejection = probes.find(
    ({ result }) => !result.ok && result.reason !== 'BadEnvironmentKeyInToken'
  )?.result;
  throw new BadRequestError(
    rejection && !rejection.ok
      ? `${definition.displayName} rejected the credential: ${rejection.reason}`
      : `${definition.displayName} rejected the key for both Sandbox and Production`,
    { code: 'credential_rejected', param: 'p8' }
  );
}

export async function revalidateCredential(db: Db, credential: Credential): Promise<Credential> {
  let secret: string;
  try {
    secret = await decryptCredentialSecret(credential);
  } catch {
    const [updated] = await db
      .update(tables.credential)
      .set({ status: 'invalid', lastError: 'Stored credential failed integrity verification' })
      .where(eq(tables.credential.id, credential.id))
      .returning();
    return updated!;
  }

  const details = credential.details as Record<string, string>;
  let outcome: ValidationOutcome;
  try {
    outcome = await validateCredentialUpload(credential.provider, {
      secret,
      details,
      environment: credential.environment,
    });
  } catch (error) {
    const [updated] = await db
      .update(tables.credential)
      .set({
        status: 'invalid',
        lastError: describeError(error),
      })
      .where(eq(tables.credential.id, credential.id))
      .returning();
    return updated!;
  }

  const [updated] = await db
    .update(tables.credential)
    .set({
      status: outcome.status,
      validatedAt: outcome.status === 'active' ? new Date() : credential.validatedAt,
      lastError: outcome.lastError,
    })
    .where(eq(tables.credential.id, credential.id))
    .returning();
  return updated!;
}
