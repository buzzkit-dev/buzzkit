import {
  currentKeyVersion,
  rewrapSecret,
  type SealedSecret,
  sealSecret,
  unsealSecret,
} from '@buzzkit/api/libs/crypto';
import { BadRequestError, describeError, NotFoundError } from '@buzzkit/api/libs/error';
import { EnvironmentSchema } from '@buzzkit/api/libs/schemas';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { parseServiceAccount } from '@buzzkit/api/providers/fcm/index';
import type { ProviderValidationResult } from '@buzzkit/api/providers/index';
import { PROVIDERS } from '@buzzkit/api/providers/index';
import { and, type Db, desc, environment, eq, isNull, lt, tables } from '@buzzkit/database';
import { t } from 'elysia';

export type Credential = typeof tables.credential.$inferSelect;
export type CredentialProvider = Credential['provider'];
export type CredentialEnvironment = Credential['environment'];
export type CredentialChannel = Credential['channel'];

function sealingContext(input: {
  tenantId: number;
  channel: CredentialChannel;
  provider: CredentialProvider;
  environment: CredentialEnvironment;
}): string {
  return ['credential', 'v1', input.tenantId, input.channel, input.provider, input.environment].join(':');
}

type ValidationOutcome = {
  status: 'active' | 'unvalidated';
  lastError: string | null;
};

export const CredentialUploadSchema = t.Union([
  t.Object({
    provider: t.Literal('apns'),
    p8: t.String({ minLength: 1, maxLength: 10_000 }),
    teamId: t.String({ minLength: 10, maxLength: 10 }),
    keyId: t.String({ minLength: 10, maxLength: 10 }),
    bundleId: t.String({ minLength: 1, maxLength: 255 }),
    environment: t.Optional(EnvironmentSchema),
  }),
  t.Object({
    provider: t.Literal('fcm'),
    serviceAccount: t.Union([t.String({ minLength: 1, maxLength: 20_000 }), t.Record(t.String(), t.Any())]),
  }),
  t.Object({
    provider: t.Literal('resend'),
    apiKey: t.String({ minLength: 1, maxLength: 256 }),
  }),
]);

export type CredentialUploadInput = typeof CredentialUploadSchema.static;

export type CredentialUpload = {
  provider: CredentialProvider;
  environment: CredentialEnvironment | null;
  secret: string;
  details: Record<string, string>;
};

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
    environment.enumValues.map(async (slot) => ({
      environment: slot,
      result: await trace<ProviderValidationResult>(
        `credentials.validate.${provider}`,
        { environment: slot },
        async () => definition.validate({ ...input, environment: slot })
      ),
    }))
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

export async function replaceCredentials(
  db: Db,
  tenantId: number,
  upload: CredentialUpload
): Promise<Credential[]> {
  const slots = upload.environment
    ? [
        {
          environment: upload.environment,
          outcome: await validateCredentialUpload(upload.provider, {
            ...upload,
            environment: upload.environment,
          }),
        },
      ]
    : await detectCredentialEnvironments(upload.provider, upload);

  const credentials: Credential[] = [];
  for (const slot of slots) {
    credentials.push(
      await replaceCredential(db, tenantId, {
        ...upload,
        environment: slot.environment,
        outcome: slot.outcome,
      })
    );
  }
  return credentials;
}

export async function validateCredentialUpload(
  provider: CredentialProvider,
  input: { secret: string; details: Record<string, string>; environment: CredentialEnvironment }
): Promise<ValidationOutcome> {
  const definition = PROVIDERS[provider];
  const result = await trace(`credentials.validate.${provider}`, async () => definition.validate(input));

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

export function serializeCredential(credential: Credential) {
  return {
    id: credential.id,
    channel: credential.channel,
    provider: credential.provider,
    environment: credential.environment,
    details: credential.details,
    status: credential.status,
    validatedAt: credential.validatedAt,
    lastError: credential.lastError,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

export async function replaceCredential(
  db: Db,
  tenantId: number,
  input: {
    provider: CredentialProvider;
    environment: CredentialEnvironment;
    secret: string;
    details: Record<string, unknown>;
    outcome: ValidationOutcome;
  }
): Promise<Credential> {
  const channel = PROVIDERS[input.provider].channel;
  const sealed = await sealSecret(
    input.secret,
    sealingContext({ tenantId, channel, provider: input.provider, environment: input.environment })
  );

  return await trace('credentials.replace', async () =>
    db.transaction(async (tx) => {
      await tx
        .update(tables.credential)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(tables.credential.tenantId, tenantId),
            eq(tables.credential.channel, channel),
            eq(tables.credential.provider, input.provider),
            eq(tables.credential.environment, input.environment),
            isNull(tables.credential.deletedAt)
          )
        );

      const [credential] = await tx
        .insert(tables.credential)
        .values({
          tenantId,
          channel,
          provider: input.provider,
          environment: input.environment,
          ...sealed,
          details: input.details,
          status: input.outcome.status,
          validatedAt: input.outcome.status === 'active' ? new Date() : null,
          lastError: input.outcome.lastError,
        })
        .returning();

      return credential!;
    })
  );
}

export async function listCredentials(db: Db, tenantId: number) {
  const rows = await trace(
    'credentials.list',
    async () =>
      await db
        .select()
        .from(tables.credential)
        .where(and(eq(tables.credential.tenantId, tenantId), isNull(tables.credential.deletedAt)))
        .orderBy(desc(tables.credential.createdAt))
  );

  return rows.map(serializeCredential);
}

export async function findCredential(db: Db, tenantId: number, credentialSqid: string): Promise<Credential> {
  const credentialId = decodeEntityId('credential', credentialSqid);

  if (!credentialId) {
    throw new NotFoundError('Credential not found');
  }

  const [credential] = await trace(
    'credentials.find',
    async () =>
      await db
        .select()
        .from(tables.credential)
        .where(
          and(
            eq(tables.credential.id, credentialId),
            eq(tables.credential.tenantId, tenantId),
            isNull(tables.credential.deletedAt)
          )
        )
  );

  if (!credential) {
    throw new NotFoundError('Credential not found');
  }

  return credential;
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

export async function softDeleteCredential(db: Db, credentialId: number): Promise<Credential> {
  const [deleted] = await trace(
    'credentials.softDelete',
    async () =>
      await db
        .update(tables.credential)
        .set({ deletedAt: new Date() })
        .where(eq(tables.credential.id, credentialId))
        .returning()
  );

  return deleted!;
}

export async function decryptCredentialSecret(credential: Credential): Promise<string> {
  const sealed: SealedSecret = {
    secretCiphertext: credential.secretCiphertext,
    secretIv: credential.secretIv,
    dekCiphertext: credential.dekCiphertext,
    dekIv: credential.dekIv,
    keyVersion: credential.keyVersion,
  };

  return await trace('credentials.decrypt', async () =>
    unsealSecret(
      sealed,
      sealingContext({
        tenantId: credential.tenantId,
        channel: credential.channel,
        provider: credential.provider,
        environment: credential.environment,
      })
    )
  );
}

export async function listCredentialsWrappedBefore(db: Db, keyVersion: number, limit: number) {
  return db
    .select()
    .from(tables.credential)
    .where(and(lt(tables.credential.keyVersion, keyVersion), isNull(tables.credential.deletedAt)))
    .limit(limit);
}

export async function rewrapCredential(db: Db, credential: Credential): Promise<Credential> {
  const sealed = await rewrapSecret(
    {
      secretCiphertext: credential.secretCiphertext,
      secretIv: credential.secretIv,
      dekCiphertext: credential.dekCiphertext,
      dekIv: credential.dekIv,
      keyVersion: credential.keyVersion,
    },
    sealingContext({
      tenantId: credential.tenantId,
      channel: credential.channel,
      provider: credential.provider,
      environment: credential.environment,
    })
  );

  const [updated] = await db
    .update(tables.credential)
    .set({
      dekCiphertext: sealed.dekCiphertext,
      dekIv: sealed.dekIv,
      keyVersion: sealed.keyVersion,
      updatedAt: new Date(),
    })
    .where(
      and(eq(tables.credential.id, credential.id), eq(tables.credential.keyVersion, credential.keyVersion))
    )
    .returning();

  return updated ?? credential;
}

export async function rewrapCredentials(db: Db, limit: number): Promise<number> {
  const current = currentKeyVersion();
  const rows = await listCredentialsWrappedBefore(db, current, limit);
  for (const row of rows) await rewrapCredential(db, row);
  return rows.length;
}
