import { type SealedSecret, sealSecret, unsealSecret } from '@buzzkit/api/libs/crypto';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { PROVIDERS } from '@buzzkit/api/providers/index';
import { and, type Db, desc, eq, isNull, tables } from '@buzzkit/database';

export type Credential = typeof tables.credential.$inferSelect;
export type CredentialProvider = Credential['provider'];
export type CredentialEnvironment = Credential['environment'];
export type CredentialChannel = Credential['channel'];

export const PROVIDER_CHANNELS = Object.fromEntries(
  Object.entries(PROVIDERS).map(([name, definition]) => [name, definition.channel])
) as Record<CredentialProvider, CredentialChannel>;

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

export async function validateCredentialUpload(
  provider: CredentialProvider,
  input: { secret: string; details: Record<string, string>; environment: CredentialEnvironment }
): Promise<ValidationOutcome> {
  const definition = PROVIDERS[provider];
  const result = await trace(`credentials.validate.${provider}`, async () => definition.validate(input));

  if (result.ok) {
    return { status: 'active', lastError: null };
  }

  if (result.transportError) {
    return { status: 'unvalidated', lastError: `${definition.displayName} unreachable: ${result.reason}` };
  }

  throw new BadRequestError(
    result.structural ? result.reason : `${definition.displayName} rejected the credential: ${result.reason}`
  );
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
  const channel = PROVIDER_CHANNELS[input.provider];
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
        channel: credential.channel,
        provider: credential.provider,
        environment: credential.environment,
      })
    )
  );
}
