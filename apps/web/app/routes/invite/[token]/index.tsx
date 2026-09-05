import { Button } from '@buzzkit/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { FieldError } from '@buzzkit/ui/components/field';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { Form, Link, useNavigation } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { AuthPage } from '@/app/components/auth/page';
import { WorkspaceAvatar } from '@/app/components/layout/workspace-switcher';
import { inviteAction } from '@/app/lib/actions/invite.server';
import { ApiError, getInvitePreview, getProfile } from '@/app/lib/api.server';
import { readSessionToken } from '@/app/lib/session.server';
import type { Route } from './+types/index';

export function meta({ loaderData }: Route.MetaArgs) {
  const name = loaderData?.preview?.workspace.name;
  return [{ title: name ? `Join ${name} · BuzzKit` : 'Invite · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const ctx = { request, env };

  let preview: Awaited<ReturnType<typeof getInvitePreview>> | null = null;
  try {
    preview = await getInvitePreview(ctx, params.token);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
  }

  let selfEmail: string | null = null;
  const token = readSessionToken(request);
  if (token) {
    try {
      selfEmail = (await getProfile(ctx, token)).email;
    } catch {
      selfEmail = null;
    }
  }

  return { preview, selfEmail };
}

export const action = inviteAction;

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

function InviteCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <AuthPage>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{title}</h1>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className='pt-1'>
          {children ?? (
            <Button variant='elevated' nativeButton={false} render={<Link to='/login' />}>
              Go to sign in
            </Button>
          )}
        </CardContent>
      </Card>
    </AuthPage>
  );
}

export default function InviteRoute({ loaderData, actionData, params }: Route.ComponentProps) {
  const { preview, selfEmail } = loaderData;
  const navigation = useNavigation();
  const pending = navigation.state !== 'idle' && navigation.formMethod != null;

  if (!preview) {
    return (
      <InviteCard
        title='Invite not found'
        description='This invite link is not valid. It may have been revoked.'
      />
    );
  }

  if (preview.accepted) {
    return (
      <InviteCard
        title='Invite already used'
        description='This invite was already accepted. Sign in to open the workspace.'
      />
    );
  }

  if (preview.expired) {
    return (
      <InviteCard
        title='Invite expired'
        description={`This invite to ${preview.workspace.name} expired. Ask for a new one.`}
      />
    );
  }

  const redirectSearch = `?redirect=/invite/${params.token}`;
  const emailMatches = selfEmail !== null && maskEmail(selfEmail.trim().toLowerCase()) === preview.email;

  return (
    <InviteCard
      title={`Join ${preview.workspace.name}`}
      description={`You were invited to join as ${preview.role}.`}
    >
      <div className='flex items-center gap-3'>
        <WorkspaceAvatar
          slug={preview.workspace.slug ?? preview.workspace.name}
          size={40}
          className='rounded-xl'
        />
        <span className='flex min-w-0 flex-col'>
          <Truncate className='font-medium text-fg-4 text-sm'>{preview.workspace.name}</Truncate>
          <Truncate className='text-fg-2 text-xs'>Invite sent to {preview.email}</Truncate>
        </span>
      </div>

      {selfEmail === null ? (
        <div className='flex flex-col gap-2'>
          <Button nativeButton={false} render={<Link to={`/login${redirectSearch}`} />}>
            Sign in to accept
          </Button>
          <Button variant='elevated' nativeButton={false} render={<Link to={`/signup${redirectSearch}`} />}>
            Create an account
          </Button>
        </div>
      ) : emailMatches ? (
        <Form method='post' className='flex flex-col gap-2'>
          <Button type='submit' loading={pending}>
            Join {preview.workspace.name}
          </Button>
          {actionData?.error && <FieldError>{actionData.error}</FieldError>}
        </Form>
      ) : (
        <div className='flex flex-col gap-3'>
          <p className='text-pretty text-fg-2 text-sm'>
            You are signed in as {selfEmail}, but this invite was sent to {preview.email}. Sign in with that
            address to accept it.
          </p>
          <Form method='post'>
            <input type='hidden' name='intent' value='sign-out' />
            <Button type='submit' variant='elevated' className='w-full'>
              Sign out
            </Button>
          </Form>
        </div>
      )}
    </InviteCard>
  );
}
