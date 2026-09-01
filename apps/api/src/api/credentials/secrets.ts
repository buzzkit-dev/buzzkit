import {
  currentKeyVersion,
  rewrapSealedRows,
  type SealedSecret,
  sealingContext,
  unsealSecret,
} from '@buzzkit/api/libs/crypto';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, type Db, eq, isNull, lt, tables } from '@buzzkit/database';
import type { Credential, CredentialChannel, CredentialEnvironment, CredentialProvider } from './types';

export function credentialContext(credential: {
  tenantId: number;
  channel: CredentialChannel;
  provider: CredentialProvider;
  environment: CredentialEnvironment;
}): string {
  return sealingContext(
    'credential',
    credential.tenantId,
    credential.channel,
    credential.provider,
    credential.environment
  );
}

export async function decryptCredentialSecret(credential: Credential): Promise<string> {
  const sealed: SealedSecret = {
    secretCiphertext: credential.secretCiphertext,
    secretIv: credential.secretIv,
    dekCiphertext: credential.dekCiphertext,
    dekIv: credential.dekIv,
    keyVersion: credential.keyVersion,
  };
  return await trace('credentials.decrypt', async () => unsealSecret(sealed, credentialContext(credential)));
}

export function listCredentialsWrappedBefore(db: Db, keyVersion: number, limit: number) {
  return db
    .select()
    .from(tables.credential)
    .where(and(lt(tables.credential.keyVersion, keyVersion), isNull(tables.credential.deletedAt)))
    .limit(limit);
}

export async function rewrapCredentials(db: Db, limit: number): Promise<number> {
  const current = currentKeyVersion();
  const rows = await listCredentialsWrappedBefore(db, current, limit);

  return await rewrapSealedRows(
    rows,
    (row) => {
      return {
        sealed: {
          secretCiphertext: row.secretCiphertext,
          secretIv: row.secretIv,
          dekCiphertext: row.dekCiphertext,
          dekIv: row.dekIv,
          keyVersion: row.keyVersion,
        },
        context: credentialContext(row),
      };
    },
    async (row, next) => {
      await db
        .update(tables.credential)
        .set({ ...next, updatedAt: new Date() })
        .where(and(eq(tables.credential.id, row.id), eq(tables.credential.keyVersion, row.keyVersion)));
    }
  );
}
