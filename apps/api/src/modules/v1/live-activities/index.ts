import { SendLiveActivitySchema, sendLiveActivity } from '@buzzkit/api/api/live-activities/index';
import { findSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const liveActivities = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Live Activities'] } })
  .post(
    '/live-activities/send',
    async ({ body, db, tenant }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, body.to);
      const results = await sendLiveActivity(db, tenant, subscriber, body);
      return Response.success({ results }, { ignoreTransform: ['results'] }).send();
    },
    { tenant: 'messages:send', body: SendLiveActivitySchema }
  );
