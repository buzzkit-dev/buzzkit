import { stableStringify } from '@buzzkit/api/utils/json';
import type { Db } from '@buzzkit/database';

type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

export function payloadChanged(next: unknown | undefined, current: unknown): boolean {
  return next !== undefined && stableStringify(next) !== stableStringify(current);
}

export async function createVersioned<Entity, Version>(
  db: Db,
  steps: {
    insertEntity: (tx: Transaction) => Promise<Entity>;
    insertVersion: (tx: Transaction, entity: Entity) => Promise<Version>;
    finalize?: (tx: Transaction, entity: Entity, version: Version) => Promise<Entity>;
  }
): Promise<{ entity: Entity; version: Version }> {
  return await db.transaction(async (tx) => {
    const entity = await steps.insertEntity(tx);
    const version = await steps.insertVersion(tx, entity);

    if (!steps.finalize) return { entity, version };

    const finalized = await steps.finalize(tx, entity, version);

    return { entity: finalized, version };
  });
}

export async function updateVersioned<Entity, Version extends { version: number }>(
  db: Db,
  steps: {
    latest: Version;
    changed: boolean;
    insertVersion: (tx: Transaction, nextVersion: number) => Promise<Version>;
    updateEntity: (tx: Transaction, version: Version) => Promise<Entity>;
  }
): Promise<{ entity: Entity; version: Version }> {
  return await db.transaction(async (tx) => {
    let version = steps.latest;
    if (steps.changed) version = await steps.insertVersion(tx, steps.latest.version + 1);

    const entity = await steps.updateEntity(tx, version);

    return { entity, version };
  });
}
