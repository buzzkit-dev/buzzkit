import { response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';
import { clientEvents } from './client/events';
import { clientIdentify } from './client/identify';
import { clientPreferences } from './client/preferences';
import { clientSubscriptions } from './client/subscriptions';
import { credentials } from './credentials';
import { credential } from './credentials/[id]';
import { credentialValidate } from './credentials/[id]/validate';
import { delivery } from './deliveries/[id]';
import { deliveryAttempts } from './deliveries/[id]/attempts';
import { events } from './events';
import { eventNames } from './events/names';
import { eventName } from './events/names/[name]';
import { eventsToken } from './events/token';
import { eventVolume } from './events/volume';
import { health } from './health';
import { invitePreview } from './invites/[token]';
import { inviteAccept } from './invites/[token]/accept';
import { messages } from './messages';
import { message } from './messages/[id]';
import { messageCancel } from './messages/[id]/cancel';
import { messageDeliveries } from './messages/[id]/deliveries';
import { profile } from './profile';
import { runs } from './runs';
import { run } from './runs/[runId]';
import { segments } from './segments';
import { segment } from './segments/[segmentSlug]';
import { segmentMembers } from './segments/[segmentSlug]/members';
import { segmentsPreview } from './segments/preview';
import { stats } from './stats';
import { subscribers } from './subscribers';
import { subscriber } from './subscribers/[externalId]';
import { subscriberDeliveries } from './subscribers/[externalId]/deliveries';
import { subscriberPreferences } from './subscribers/[externalId]/preferences';
import { subscriberRuns } from './subscribers/[externalId]/runs';
import { subscriberSubscriptions } from './subscribers/[externalId]/subscriptions';
import { subscriberTimeline } from './subscribers/[externalId]/timeline';
import { subscriptions } from './subscriptions';
import { subscription } from './subscriptions/[id]';
import { tenants } from './tenants';
import { tenant } from './tenants/[tenantSlug]';
import { tenantIdentitySecret } from './tenants/[tenantSlug]/identity-secret';
import { tenantIdentitySecretRotate } from './tenants/[tenantSlug]/identity-secret/rotate';
import { topics } from './topics';
import { topic } from './topics/[topicSlug]';
import { workflows } from './workflows';
import { workflow } from './workflows/[workflowSlug]';
import { workflowPause } from './workflows/[workflowSlug]/pause';
import { workflowPublish } from './workflows/[workflowSlug]/publish';
import { workflowRuns } from './workflows/[workflowSlug]/runs';
import { workspaces } from './workspaces';
import { workspace } from './workspaces/[workspaceSlug]';
import { auditLog } from './workspaces/[workspaceSlug]/audit';
import { invites } from './workspaces/[workspaceSlug]/invites';
import { invite } from './workspaces/[workspaceSlug]/invites/[id]';
import { inviteResend } from './workspaces/[workspaceSlug]/invites/[id]/resend';
import { keys } from './workspaces/[workspaceSlug]/keys';
import { key } from './workspaces/[workspaceSlug]/keys/[id]';
import { members } from './workspaces/[workspaceSlug]/members';
import { member } from './workspaces/[workspaceSlug]/members/[id]';
import { webhooks } from './workspaces/[workspaceSlug]/webhooks';
import { webhook } from './workspaces/[workspaceSlug]/webhooks/[id]';
import { webhookDeliveries } from './workspaces/[workspaceSlug]/webhooks/[id]/deliveries';
import { webhookDelivery } from './workspaces/[workspaceSlug]/webhooks/[id]/deliveries/[deliveryId]';
import { webhookReplay } from './workspaces/[workspaceSlug]/webhooks/[id]/deliveries/[deliveryId]/replay';
import { webhookRotate } from './workspaces/[workspaceSlug]/webhooks/[id]/rotate';
import { webhookCatalog } from './workspaces/[workspaceSlug]/webhooks/catalog';
import { webhookEvent } from './workspaces/[workspaceSlug]/webhooks/events/[id]';

export const v1 = new Elysia({ prefix: '/v1' })
  .use(response)
  /*
   * /v1/health
   */
  .use(health)
  /*
   * /v1/profile
   */
  .use(profile)
  /*
   * /v1/workspaces
   */
  .use(workspaces)
  /*
   * /v1/workspaces/:slug
   */
  .use(workspace)
  /*
   * /v1/workspaces/:slug/members
   */
  .use(members)
  /*
   * /v1/workspaces/:slug/members/:id
   */
  .use(member)
  /*
   * /v1/workspaces/:slug/invites
   */
  .use(invites)
  /*
   * /v1/workspaces/:slug/invites/:id
   */
  .use(invite)
  /*
   * /v1/workspaces/:slug/invites/:id/resend
   */
  .use(inviteResend)
  /*
   * /v1/invites/:token
   */
  .use(invitePreview)
  /*
   * /v1/invites/:token/accept
   */
  .use(inviteAccept)
  /*
   * /v1/workspaces/:slug/keys
   */
  .use(keys)
  /*
   * /v1/workspaces/:slug/keys/:id
   */
  .use(key)
  /*
   * /v1/workspaces/:slug/audit
   */
  .use(auditLog)
  /*
   * /v1/workspaces/:slug/webhooks
   */
  .use(webhooks)
  /*
   * /v1/workspaces/:slug/webhooks/catalog
   */
  .use(webhookCatalog)
  /*
   * /v1/workspaces/:slug/webhooks/events/:id
   */
  .use(webhookEvent)
  /*
   * /v1/workspaces/:slug/webhooks/:id
   */
  .use(webhook)
  /*
   * /v1/workspaces/:slug/webhooks/:id/rotate
   */
  .use(webhookRotate)
  /*
   * /v1/workspaces/:slug/webhooks/:id/deliveries
   */
  .use(webhookDeliveries)
  /*
   * /v1/workspaces/:slug/webhooks/:id/deliveries/:deliveryId
   */
  .use(webhookDelivery)
  /*
   * /v1/workspaces/:slug/webhooks/:id/deliveries/:deliveryId/replay
   */
  .use(webhookReplay)
  /*
   * /v1/tenants
   */
  .use(tenants)
  /*
   * /v1/tenants/:tenantSlug
   */
  .use(tenant)
  /*
   * /v1/tenants/:tenantSlug/identity-secret
   */
  .use(tenantIdentitySecret)
  /*
   * /v1/tenants/:tenantSlug/identity-secret/rotate
   */
  .use(tenantIdentitySecretRotate)
  /*
   * /v1/credentials
   */
  .use(credentials)
  /*
   * /v1/credentials/:id
   */
  .use(credential)
  /*
   * /v1/credentials/:id/validate
   */
  .use(credentialValidate)
  /*
   * /v1/subscribers
   */
  .use(subscribers)
  /*
   * /v1/subscribers/:externalId
   */
  .use(subscriber)
  /*
   * /v1/subscribers/:externalId/subscriptions
   */
  .use(subscriberSubscriptions)
  /*
   * /v1/subscribers/:externalId/preferences
   */
  .use(subscriberPreferences)
  /*
   * /v1/subscribers/:externalId/deliveries
   */
  .use(subscriberDeliveries)
  /*
   * /v1/subscribers/:externalId/timeline
   */
  .use(subscriberTimeline)
  /*
   * /v1/subscribers/:externalId/runs
   */
  .use(subscriberRuns)
  /*
   * /v1/subscriptions
   */
  .use(subscriptions)
  /*
   * /v1/subscriptions/:id
   */
  .use(subscription)
  /*
   * /v1/topics
   */
  .use(topics)
  /*
   * /v1/topics/:topicSlug
   */
  .use(topic)
  /*
   * /v1/segments
   */
  .use(segments)
  /*
   * /v1/segments/preview
   */
  .use(segmentsPreview)
  /*
   * /v1/segments/:segmentSlug
   */
  .use(segment)
  /*
   * /v1/segments/:segmentSlug/members
   */
  .use(segmentMembers)
  /*
   * /v1/workflows
   */
  .use(workflows)
  /*
   * /v1/workflows/:workflowSlug
   */
  .use(workflow)
  /*
   * /v1/workflows/:workflowSlug/publish
   */
  .use(workflowPublish)
  /*
   * /v1/workflows/:workflowSlug/pause
   */
  .use(workflowPause)
  /*
   * /v1/workflows/:workflowSlug/runs
   */
  .use(workflowRuns)
  /*
   * /v1/runs/:runId
   */
  .use(runs)
  /*
   * /v1/runs/:runId
   */
  .use(run)
  /*
   * /v1/messages
   */
  .use(messages)
  /*
   * /v1/messages/:id
   */
  .use(message)
  /*
   * /v1/messages/:id/cancel
   */
  .use(messageCancel)
  /*
   * /v1/messages/:id/deliveries
   */
  .use(messageDeliveries)
  /*
   * /v1/events
   */
  .use(events)
  /*
   * /v1/events/names
   */
  .use(eventNames)
  /*
   * /v1/events/names/:name
   */
  .use(eventName)
  /*
   * /v1/events/token
   */
  .use(eventsToken)
  /*
   * /v1/events/volume
   */
  .use(eventVolume)
  /*
   * /v1/stats
   */
  .use(stats)
  /*
   * /v1/deliveries/:id
   */
  .use(delivery)
  /*
   * /v1/deliveries/:id/attempts
   */
  .use(deliveryAttempts)
  /*
   * /v1/client/identify
   */
  .use(clientIdentify)
  /*
   * /v1/client/subscriptions
   */
  .use(clientSubscriptions)
  /*
   * /v1/client/preferences
   */
  .use(clientPreferences)
  /*
   * /v1/client/events
   */
  .use(clientEvents);
