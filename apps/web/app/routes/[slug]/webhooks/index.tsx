import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@buzzkit/ui/components/dialog';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { FieldGroup } from '@buzzkit/ui/components/field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { EndpointStatusBadge } from '@/app/components/badges';
import { EndpointFields, useEndpointForm } from '@/app/components/webhooks/endpoint-form';
import { EventsSummary } from '@/app/components/webhooks/events-summary';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { Time } from '@/app/hooks/use-time-ago';
import { webhooksAction } from '@/app/lib/actions/webhooks.server';
import {
  getWebhookCatalog,
  listTenants,
  listWebhooks,
  type Webhook,
  type WebhookCatalog,
} from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Webhooks · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };
  const [endpoints, catalog, tenants] = await Promise.all([
    listWebhooks(ctx, token, params.slug),
    getWebhookCatalog(ctx, token, params.slug),
    listTenants(ctx, token, params.slug),
  ]);
  return { endpoints, catalog, tenants };
}

export const action = webhooksAction;

function CreateForm({
  catalog,
  tenants,
  slug,
  onClose,
}: {
  catalog: WebhookCatalog;
  tenants: { id: string; name: string; slug: string; isDefault: boolean }[];
  slug: string;
  onClose: () => void;
}) {
  const form = useEndpointForm({}, catalog);
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);
  const { submit, pending } = useActionFetcher((data) => {
    if (typeof data.secret === 'string' && typeof data.id === 'string')
      setCreated({ id: data.id, secret: data.secret });
    else onClose();
  });

  if (created) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Copy the signing secret</DialogTitle>
        </DialogHeader>
        <div className='flex w-full flex-col gap-3'>
          <CodeBlock code={created.secret} className='w-full' />
          <span className='text-fg-2 text-sm'>
            Verify every delivery with it. You can read it again from the endpoint page and rotate it any
            time.
          </span>
          <Button
            className='w-full'
            nativeButton={false}
            render={<Link to={`/${slug}/webhooks/${created.id}`} />}
          >
            Open endpoint
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>New endpoint</DialogTitle>
      </DialogHeader>
      <FieldGroup className='w-full'>
        <EndpointFields form={form} catalog={catalog} tenants={tenants} idPrefix='webhook' />
        <Button
          className='w-full'
          disabled={!form.valid || pending}
          loading={pending}
          onClick={() =>
            submit('create', {
              url: form.values.url,
              description: form.values.description,
              tenant: form.values.tenant,
              events: JSON.stringify(form.values.events),
            })
          }
        >
          Create endpoint
        </Button>
      </FieldGroup>
    </>
  );
}

function EndpointRow({
  endpoint,
  tenantName,
  showTenant,
  slug,
}: {
  endpoint: Webhook;
  tenantName: string | null;
  showTenant: boolean;
  slug: string;
}) {
  return (
    <TableRow>
      <TableCell className='font-medium text-fg-4'>
        <Link
          to={`/${slug}/webhooks/${endpoint.id}`}
          className='flex min-w-0 flex-col outline-none focus-visible:underline'
        >
          <Truncate>{endpoint.url}</Truncate>
          {endpoint.description && (
            <Truncate className='font-normal text-fg-2 text-xs'>{endpoint.description}</Truncate>
          )}
        </Link>
      </TableCell>
      <TableCell className='py-2'>
        <EndpointStatusBadge enabled={endpoint.enabled} failing={endpoint.failingSince !== null} />
      </TableCell>
      {showTenant && <TableCell>{tenantName ?? <span className='text-fg-2'>All tenants</span>}</TableCell>}
      <TableCell>
        <EventsSummary events={endpoint.events} />
      </TableCell>
      <TableCell>
        <Time at={endpoint.createdAt} />
      </TableCell>
    </TableRow>
  );
}

export default function WebhooksRoute({ loaderData, params }: Route.ComponentProps) {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const { endpoints, catalog, tenants } = loaderData;
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const tenantName = (tenantId: string | null) =>
    tenants.find((entry) => entry.id === tenantId)?.name ?? null;
  const openDialog = () => {
    setOpened((count) => count + 1);
    setOpen(true);
  };

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Webhooks
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>Receive events on your servers.</p>
        </div>
        {canManage && (
          <Button icon='IconPlusMedium' onClick={openDialog}>
            Add endpoint
          </Button>
        )}
      </header>

      <Card className='min-h-0 shrink'>
        {endpoints.length === 0 ? (
          <EmptyState
            icon='IconWebhooksFilled'
            title='No endpoints yet'
            description='Add an endpoint to start receiving events.'
            className='py-10'
          >
            {canManage && (
              <Button icon='IconPlusMedium' onClick={openDialog}>
                Add endpoint
              </Button>
            )}
          </EmptyState>
        ) : (
          <Table className='table-fixed'>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead className='w-24'>Status</TableHead>
                {tenants.length > 1 && <TableHead className='w-36'>Tenant</TableHead>}
                <TableHead className='w-48'>Events</TableHead>
                <TableHead className='w-32'>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map((endpoint) => (
                <EndpointRow
                  key={endpoint.id}
                  endpoint={endpoint}
                  tenantName={tenantName(endpoint.tenantId)}
                  showTenant={tenants.length > 1}
                  slug={params.slug}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton>
          <CreateForm
            key={opened}
            catalog={catalog}
            tenants={tenants}
            slug={params.slug}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
