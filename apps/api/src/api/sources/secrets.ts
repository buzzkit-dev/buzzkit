import {
  currentKeyVersion,
  rewrapSealedRows,
  type SealedSecret,
  sealingContext,
  sealSecret,
  unsealSecret,
} from '@buzzkit/api/libs/crypto';
import { and, type Db, eq, isNull, lt, tables } from '@buzzkit/database';
import type { Source } from './types';

export async function sealSourceSecret(
  tenantId: number,
  sourceId: number,
  secret: string
): Promise<SealedSecret> {
  return await sealSecret(secret, sealingContext('source', tenantId, sourceId));
}

export async function resolveSecret(source: Source): Promise<string | null> {
  if (
    !source.secretCiphertext ||
    !source.secretIv ||
    !source.dekCiphertext ||
    !source.dekIv ||
    source.keyVersion === null
  ) {
    return null;
  }

  return await unsealSecret(
    {
      secretCiphertext: source.secretCiphertext,
      secretIv: source.secretIv,
      dekCiphertext: source.dekCiphertext,
      dekIv: source.dekIv,
      keyVersion: source.keyVersion,
    },
    sealingContext('source', source.tenantId, source.id)
  );
}

export async function rewrapSources(db: Db, limit: number): Promise<number> {
  const current = currentKeyVersion();
  const rows = await db
    .select()
    .from(tables.source)
    .where(and(lt(tables.source.keyVersion, current), isNull(tables.source.deletedAt)))
    .limit(limit);

  return await rewrapSealedRows(
    rows,
    (row) => {
      const whole =
        row.secretCiphertext && row.secretIv && row.dekCiphertext && row.dekIv && row.keyVersion !== null;
      if (!whole) return { sealed: null, context: '' };

      return {
        sealed: {
          secretCiphertext: row.secretCiphertext as string,
          secretIv: row.secretIv as string,
          dekCiphertext: row.dekCiphertext as string,
          dekIv: row.dekIv as string,
          keyVersion: row.keyVersion as number,
        },
        context: sealingContext('source', row.tenantId, row.id),
      };
    },
    async (row, next) => {
      await db.update(tables.source).set(next).where(eq(tables.source.id, row.id));
    }
  );
}
