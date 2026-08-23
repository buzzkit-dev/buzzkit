import { Badge } from '@buzzkit/ui/components/badge';
import { Button } from '@buzzkit/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { GuideStep } from '@buzzkit/ui/components/guide-step';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { Link, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { CHANNELS } from '@/app/components/onboarding/catalog';
import { ApiError, listCredentials, listKeys, listMessages, listSubscribers } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };

  const [credentials, keys, subscribers, messages] = await Promise.all([
    listCredentials(ctx, token, params.slug, 'default'),
    listKeys(ctx, token, params.slug).catch((error) => {
      if (error instanceof ApiError && error.status === 403) return [];
      throw error;
    }),
    listSubscribers(ctx, token, params.slug, 'default', { limit: 1 }),
    listMessages(ctx, token, params.slug, 'default', { limit: 1 }),
  ]);

  return {
    credentials,
    hasKey: keys.some((key) => key.kind === 'workspace' && !key.revokedAt),
    hasSubscriber: subscribers.items.length > 0,
    hasMessage: messages.items.length > 0,
  };
}

function sendSnippet(apiUrl: string) {
  return [
    `curl -X POST ${apiUrl}/v1/messages \\`,
    `  -H 'Authorization: Bearer bk_ws_your_workspace_key' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{ "to": ["user_42"], "title": "Hello from BuzzKit", "body": "Your first push." }'`,
  ].join('\n');
}

function registerSnippet(apiUrl: string) {
  return [
    `curl -X POST ${apiUrl}/v1/subscriptions \\`,
    `  -H 'Authorization: Bearer bk_ws_your_workspace_key' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{ "externalId": "user_42", "channel": "push", "platform": "ios", "token": "<device token>" }'`,
  ].join('\n');
}

export default function OverviewRoute({ loaderData }: Route.ComponentProps) {
  const { workspace, apiUrl } = useOutletContext<WorkspaceOutletContext>();
  const { credentials, hasKey, hasSubscriber, hasMessage } = loaderData;

  const hasChannel = credentials.length > 0;
  const steps = [hasChannel, hasKey, hasSubscriber, hasMessage];
  const firstOpen = steps.findIndex((done) => !done);
  const stateOf = (index: number) => (steps[index] ? 'done' : index === firstOpen ? 'active' : 'upcoming');
  const allDone = firstOpen === -1;

  return (
    <div className='w-full'>
      <div className='flex w-full flex-col gap-6'>
        <header className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            {workspace.name}
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            {allDone
              ? 'Everything is wired up. Subscribers and messages land here as your app sends them.'
              : 'Four steps from a blank workspace to a notification on a phone.'}
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Channels</CardTitle>
            <CardDescription>Provider keys connected to this workspace.</CardDescription>
          </CardHeader>
          <CardContent className='gap-0 pb-3'>
            <ul className='-mx-4 flex flex-col divide-y divide-bg-3'>
              {CHANNELS.filter((channel) => channel.available).map((channel) => {
                const connected = credentials.filter((credential) => credential.channel === channel.id);
                return (
                  <li key={channel.id} className='flex min-h-12 items-center gap-3 px-4 py-2'>
                    <IconTile icon={channel.icon} size='sm' />
                    <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                      <span className='truncate font-medium text-fg-4 text-sm'>{channel.name}</span>
                      <span className='truncate text-fg-2 text-xs'>
                        {connected.length === 0
                          ? 'Not connected'
                          : connected
                              .map((credential) => {
                                const provider = channel.providers.find((p) => p.id === credential.provider);
                                return provider?.name ?? credential.provider;
                              })
                              .join(' · ')}
                      </span>
                    </span>
                    <span className='flex shrink-0 items-center gap-2'>
                      {connected.some((credential) => credential.status === 'active') && (
                        <Badge variant='green' size='sm'>
                          Active
                        </Badge>
                      )}
                      {connected.some((credential) => credential.status === 'unvalidated') && (
                        <Badge variant='amber' size='sm'>
                          Unverified
                        </Badge>
                      )}
                      {connected.some((credential) => credential.status === 'invalid') && (
                        <Badge variant='red' size='sm'>
                          Invalid
                        </Badge>
                      )}
                      <Button
                        variant='elevated'
                        size='xs'
                        nativeButton={false}
                        render={<Link to={`/${workspace.slug}/onboarding/${channel.id}`} />}
                      >
                        {connected.length === 0 ? 'Connect' : 'Manage'}
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {!allDone && (
          <Card className='px-6 py-7'>
            <ol className='flex flex-col gap-7'>
              <li>
                <GuideStep number={1} title='Connect a channel' state={stateOf(0)}>
                  <div className='flex flex-col gap-2'>
                    <p className='text-pretty text-fg-2 text-sm'>
                      Upload an APNs key, a Firebase service account or a Resend key. BuzzKit checks it live.
                    </p>
                    {!hasChannel && (
                      <div className='flex'>
                        <Button
                          size='sm'
                          nativeButton={false}
                          render={<Link to={`/${workspace.slug}/onboarding`} />}
                        >
                          Connect a channel
                        </Button>
                      </div>
                    )}
                  </div>
                </GuideStep>
              </li>
              <li>
                <GuideStep number={2} title='Create an API key' state={stateOf(1)}>
                  <p className='text-pretty text-fg-2 text-sm'>
                    A workspace key (bk_ws_…) is the one secret your backend stores. Key management lands in
                    Settings with the next dashboard phase.
                  </p>
                </GuideStep>
              </li>
              <li>
                <GuideStep
                  number={3}
                  title='Register a device'
                  state={stateOf(2)}
                  waiting='Waiting for a device'
                >
                  <div className='flex flex-col gap-1.5'>
                    <CodeBlock code={registerSnippet(apiUrl)} />
                    <p className='text-pretty text-fg-2 text-xs'>
                      Creates the subscriber and its push subscription in one call.
                    </p>
                  </div>
                </GuideStep>
              </li>
              <li>
                <GuideStep
                  number={4}
                  title='Send your first message'
                  state={stateOf(3)}
                  waiting='Waiting for a send'
                >
                  <div className='flex flex-col gap-1.5'>
                    <CodeBlock code={sendSnippet(apiUrl)} />
                    <p className='text-pretty text-fg-2 text-xs'>
                      Returns a message id right away. Delivery is async.
                    </p>
                  </div>
                </GuideStep>
              </li>
            </ol>
          </Card>
        )}
      </div>
    </div>
  );
}
