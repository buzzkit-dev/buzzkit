import { response } from '@buzzkit/api/libs/response';
import { health } from '@buzzkit/api/modules/v1/health/index';
import { inviteAccept } from '@buzzkit/api/modules/v1/invites/[token]/accept/index';
import { invitePreview } from '@buzzkit/api/modules/v1/invites/[token]/index';
import { profile } from '@buzzkit/api/modules/v1/profile/index';
import { apnsSpike } from '@buzzkit/api/modules/v1/spike/apns/index';
import { tenant } from '@buzzkit/api/modules/v1/tenants/[tenantSlug]/index';
import { tenants } from '@buzzkit/api/modules/v1/tenants/index';
import { workspace } from '@buzzkit/api/modules/v1/workspaces/[slug]/index';
import { invite } from '@buzzkit/api/modules/v1/workspaces/[slug]/invites/[id]/index';
import { invites } from '@buzzkit/api/modules/v1/workspaces/[slug]/invites/index';
import { key } from '@buzzkit/api/modules/v1/workspaces/[slug]/keys/[id]/index';
import { keys } from '@buzzkit/api/modules/v1/workspaces/[slug]/keys/index';
import { member } from '@buzzkit/api/modules/v1/workspaces/[slug]/members/[id]/index';
import { members } from '@buzzkit/api/modules/v1/workspaces/[slug]/members/index';
import { workspaces } from '@buzzkit/api/modules/v1/workspaces/index';
import Elysia from 'elysia';

export const v1 = new Elysia({ prefix: '/v1' })
  .use(response)
  .use(health)
  .use(apnsSpike)
  .use(profile)
  .use(workspaces)
  .use(workspace)
  .use(members)
  .use(member)
  .use(invites)
  .use(invite)
  .use(invitePreview)
  .use(inviteAccept)
  .use(keys)
  .use(key)
  .use(tenants)
  .use(tenant);
