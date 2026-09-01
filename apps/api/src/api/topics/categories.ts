import { ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, asc, type Db, eq, isNull, ne, sql, tables } from '@buzzkit/database';
import type { TopicCategory, TopicRecord } from './types';

export async function listTopicCategories(db: Db, tenantId: number): Promise<TopicCategory[]> {
  return await trace('topics.categories.list', async () => {
    return await db
      .select()
      .from(tables.topicCategory)
      .where(and(eq(tables.topicCategory.tenantId, tenantId), isNull(tables.topicCategory.deletedAt)))
      .orderBy(asc(tables.topicCategory.name));
  });
}

export async function findTopicCategory(
  db: Db,
  tenantId: number,
  categorySqid: string
): Promise<TopicCategory> {
  const id = decodeEntityId('topicCategory', categorySqid);
  if (id === undefined) {
    throw new NotFoundError('Category not found');
  }

  const [category] = await db
    .select()
    .from(tables.topicCategory)
    .where(
      and(
        eq(tables.topicCategory.id, id),
        eq(tables.topicCategory.tenantId, tenantId),
        isNull(tables.topicCategory.deletedAt)
      )
    );
  if (!category) {
    throw new NotFoundError('Category not found');
  }
  return category;
}

export async function resolveTopicCategory(
  db: Db,
  tenantId: number,
  name: string | null | undefined
): Promise<TopicCategory | null> {
  if (name === undefined || name === null) return null;

  const trimmed = name.trim();
  if (trimmed.length === 0) return null;

  const [existing] = await db
    .select()
    .from(tables.topicCategory)
    .where(
      and(
        eq(tables.topicCategory.tenantId, tenantId),
        sql`lower(${tables.topicCategory.name}) = lower(${trimmed})`,
        isNull(tables.topicCategory.deletedAt)
      )
    );
  if (existing) return existing;

  const [created] = await db.insert(tables.topicCategory).values({ tenantId, name: trimmed }).returning();
  return created as TopicCategory;
}

export async function resolveCategoryName(db: Db, record: TopicRecord): Promise<string | null> {
  if (!record.categoryId) return null;

  const [row] = await db
    .select({ name: tables.topicCategory.name })
    .from(tables.topicCategory)
    .where(eq(tables.topicCategory.id, record.categoryId));
  return row?.name ?? null;
}

export async function renameTopicCategory(
  db: Db,
  tenantId: number,
  category: TopicCategory,
  name: string
): Promise<TopicCategory> {
  const trimmed = name.trim();
  const [duplicate] = await db
    .select({ id: tables.topicCategory.id })
    .from(tables.topicCategory)
    .where(
      and(
        eq(tables.topicCategory.tenantId, tenantId),
        sql`lower(${tables.topicCategory.name}) = lower(${trimmed})`,
        isNull(tables.topicCategory.deletedAt),
        ne(tables.topicCategory.id, category.id)
      )
    );
  if (duplicate) {
    throw new ConflictError('A category with this name already exists');
  }

  const [updated] = await db
    .update(tables.topicCategory)
    .set({ name: trimmed })
    .where(eq(tables.topicCategory.id, category.id))
    .returning();
  return updated as TopicCategory;
}

export async function softDeleteTopicCategory(db: Db, category: TopicCategory): Promise<TopicCategory> {
  await db.update(tables.topic).set({ categoryId: null }).where(eq(tables.topic.categoryId, category.id));

  const [deleted] = await db
    .update(tables.topicCategory)
    .set({ deletedAt: new Date() })
    .where(eq(tables.topicCategory.id, category.id))
    .returning();
  return deleted as TopicCategory;
}
