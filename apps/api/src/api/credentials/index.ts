import { sealSecret } from '@buzzkit/api/libs/crypto';
import { NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { PROVIDERS } from '@buzzkit/api/providers/index';
import { and, type Db, desc, eq, isNull, tables } from '@buzzkit/database';
import { credentialContext } from './secrets';
import { serializeCredential } from './serialize';
import type {
  Credential,
  CredentialEnvironment,
  CredentialProvider,
  CredentialUpload,
  ValidationOutcome,
} from './types';
import { detectCredentialEnvironments, validateCredentialUpload } from './validation';

export * from './channels';
export * from './schemas';
export * from './secrets';
export * from './serialize';
export type * from './types';
export * from './validation';

export async function listCredentials(db: Db, tenantId: number) {
  const rows = await trace('credentials.list', async () => {
    return await db
      .select()
      .from(tables.credential)
      .where(and(eq(tables.credential.tenantId, tenantId), isNull(tables.credential.deletedAt)))
      .orderBy(desc(tables.credential.createdAt));
  });
  return rows.map(serializeCredential);
}

export async function findCredential(db: Db, tenantId: number, credentialSqid: string): Promise<Credential> {
  const credentialId = decodeEntityId('credential', credentialSqid);
  if (!credentialId) {
    throw new NotFoundError('Credential not found');
  }

  const [credential] = await trace('credentials.find', async () => {
    return await db
      .select()
      .from(tables.credential)
      .where(
        and(
          eq(tables.credential.id, credentialId),
          eq(tables.credential.tenantId, tenantId),
          isNull(tables.credential.deletedAt)
        )
      );
  });

  if (!credential) {
    throw new NotFoundError('Credential not found');
  }
  return credential;
}

export async function replaceCredentials(
  db: Db,
  tenantId: number,
  upload: CredentialUpload
): Promise<Credential[]> {
  let slots: Array<{ environment: CredentialEnvironment; outcome: ValidationOutcome }>;
  if (upload.environment) {
    const outcome = await validateCredentialUpload(upload.provider, {
      ...upload,
      environment: upload.environment,
    });
    slots = [{ environment: upload.environment, outcome }];
  } else {
    slots = await detectCredentialEnvironments(upload.provider, upload);
  }

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
    credentialContext({ tenantId, channel, provider: input.provider, environment: input.environment })
  );

  return await trace('credentials.replace', async () => {
    return await db.transaction(async (tx) => {
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
    });
  });
}

export async function softDeleteCredential(db: Db, credentialId: number): Promise<Credential> {
  const [deleted] = await trace('credentials.softDelete', async () => {
    return await db
      .update(tables.credential)
      .set({ deletedAt: new Date() })
      .where(eq(tables.credential.id, credentialId))
      .returning();
  });
  return deleted!;
}
