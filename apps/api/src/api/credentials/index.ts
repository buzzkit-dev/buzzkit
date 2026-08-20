import { type SealedSecret, sealSecret, unsealSecret } from '@buzzkit/api/libs/crypto';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { validateApnsCredential } from '@buzzkit/api/providers/apns/index';
import { type FcmServiceAccount, requestFcmAccessToken } from '@buzzkit/api/providers/fcm/index';
import { and, type Db, desc, eq, isNull, tables } from '@buzzkit/database';

export type Credential = typeof tables.credential.$inferSelect;
export type CredentialProvider = Credential['provider'];
export type CredentialEnvironment = Credential['environment'];

function sealingContext(input: {
  tenantId: number;
  provider: CredentialProvider;
  environment: CredentialEnvironment;
}): string {
  return ['credential', 'v1', input.tenantId, 'push', input.provider, input.environment].join(':');
}

type ValidationOutcome = {
  status: 'active' | 'unvalidated';
  lastError: string | null;
};

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

export async function validateApnsUpload(input: {
  p8: string;
  teamId: string;
  keyId: string;
  bundleId: string;
  environment: CredentialEnvironment;
}): Promise<ValidationOutcome> {
  const result = await trace('credentials.validateApns', async () => validateApnsCredential(input));

  if (result.ok) {
    return { status: 'active', lastError: null };
  }

  if (result.transportError) {
    return { status: 'unvalidated', lastError: `APNs unreachable: ${result.reason}` };
  }

  throw new BadRequestError(
    result.structural ? result.reason : `APNs rejected the credential: ${result.reason}`
  );
}

export async function validateFcmUpload(account: FcmServiceAccount): Promise<ValidationOutcome> {
  const result = await trace('credentials.validateFcm', async () => requestFcmAccessToken(account));

  if (result.ok) {
    return { status: 'active', lastError: null };
  }

  if (result.transportError) {
    return { status: 'unvalidated', lastError: `Google OAuth unreachable: ${result.reason}` };
  }

  throw new BadRequestError(`Google rejected the service account: ${result.reason}`);
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
  const sealed = await sealSecret(
    input.secret,
    sealingContext({ tenantId, provider: input.provider, environment: input.environment })
  );

  return await trace('credentials.replace', async () =>
    db.transaction(async (tx) => {
      await tx
        .update(tables.credential)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(tables.credential.tenantId, tenantId),
            eq(tables.credential.channel, 'push'),
            eq(tables.credential.provider, input.provider),
            eq(tables.credential.environment, input.environment),
            isNull(tables.credential.deletedAt)
          )
        );

      const [credential] = await tx
        .insert(tables.credential)
        .values({
          tenantId,
          channel: 'push',
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
    throw new BadRequestError('Invalid credential identifier');
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

  let outcome: ValidationOutcome & { invalidError?: string };
  try {
    outcome =
      credential.provider === 'apns'
        ? await validateApnsUpload({
            p8: secret,
            teamId: details.teamId ?? '',
            keyId: details.keyId ?? '',
            bundleId: details.bundleId ?? '',
            environment: credential.environment,
          })
        : await validateFcmUpload({
            project_id: details.projectId ?? '',
            client_email: details.clientEmail ?? '',
            private_key: secret,
          });
  } catch (error) {
    const [updated] = await db
      .update(tables.credential)
      .set({
        status: 'invalid',
        lastError: error instanceof Error ? error.message : String(error),
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
        provider: credential.provider,
        environment: credential.environment,
      })
    )
  );
}
