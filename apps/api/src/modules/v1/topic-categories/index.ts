import { diffForEvent } from '@buzzkit/api/api/audit/index';
import {
  findTopicCategoryById,
  listTopicCategories,
  renameTopicCategory,
  serializeTopicCategory,
  softDeleteTopicCategory,
} from '@buzzkit/api/api/topics/index';
import { auth } from '@buzzkit/api/libs/auth';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import Elysia, { t } from 'elysia';

export const topicCategories = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Topics'] } })
  .get(
    '/topic-categories',
    async ({ db, tenant }) => {
      const categories = await listTopicCategories(db, tenant.id);
      return Response.list(categories.map(serializeTopicCategory), { entity: 'topicCategory' }).send();
    },
    { tenant: 'topics:read' }
  )
  .patch(
    '/topic-categories/:id',
    async ({ audit, body, db, params, tenant }) => {
      const category = await findTopicCategoryById(db, tenant.id, decodeEntityId('topicCategory', params.id));
      const renamed = await renameTopicCategory(db, tenant.id, category, body.name);

      await audit({
        event: 'topic_category.renamed',
        tenantId: tenant.id,
        target: { type: 'topicCategory', id: renamed.id },
        data: diffForEvent(serializeTopicCategory(category), serializeTopicCategory(renamed), []),
      });

      return Response.success(serializeTopicCategory(renamed), { entity: 'topicCategory' }).send();
    },
    { tenant: 'topics:write', body: t.Object({ name: t.String({ minLength: 1, maxLength: 100 }) }) }
  )
  .delete(
    '/topic-categories/:id',
    async ({ audit, db, params, tenant }) => {
      const category = await findTopicCategoryById(db, tenant.id, decodeEntityId('topicCategory', params.id));
      const deleted = await softDeleteTopicCategory(db, category);

      await audit({
        event: 'topic_category.deleted',
        tenantId: tenant.id,
        target: { type: 'topicCategory', id: deleted.id },
        data: { name: deleted.name },
      });

      return Response.success(markDeleted(serializeTopicCategory(deleted)), {
        entity: 'topicCategory',
      }).send();
    },
    { tenant: 'topics:write' }
  );
