import { response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';
import { credentials } from './credentials';
import { credential } from './credentials/[id]';
import { credentialValidate } from './credentials/[id]/validate';
import { credentialsApns } from './credentials/apns';
import { credentialsFcm } from './credentials/fcm';
import { health } from './health';
import { invitePreview } from './invites/[token]';
import { inviteAccept } from './invites/[token]/accept';
import { profile } from './profile';
import { apnsSpike } from './spike/apns';
import { tenants } from './tenants';
import { tenant } from './tenants/[tenantSlug]';
import { workspaces } from './workspaces';
import { workspace } from './workspaces/[slug]';
import { events } from './workspaces/[slug]/events';
import { invites } from './workspaces/[slug]/invites';
import { invite } from './workspaces/[slug]/invites/[id]';
import { inviteResend } from './workspaces/[slug]/invites/[id]/resend';
import { keys } from './workspaces/[slug]/keys';
import { key } from './workspaces/[slug]/keys/[id]';
import { members } from './workspaces/[slug]/members';
import { member } from './workspaces/[slug]/members/[id]';

export const v1 = new Elysia({ prefix: '/v1' })
  .use(response)
  /*
   * /v1/health
   */
  .use(health)
  /*
   * /v1/spike/apns — Phase 0 APNs spike, removed in Phase 4
   */
  .use(apnsSpike)
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
   * /v1/workspaces/:slug/events
   */
  .use(events)
  /*
   * /v1/tenants
   */
  .use(tenants)
  /*
   * /v1/tenants/:tenantSlug
   */
  .use(tenant)
  /*
   * /v1/credentials
   */
  .use(credentials)
  /*
   * /v1/credentials/apns
   */
  .use(credentialsApns)
  /*
   * /v1/credentials/fcm
   */
  .use(credentialsFcm)
  /*
   * /v1/credentials/:id
   */
  .use(credential)
  /*
   * /v1/credentials/:id/validate
   */
  .use(credentialValidate);
