import { SOURCE_PRESETS, type SourceProvider } from '@buzzkit/schema/sources';
import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@buzzkit/ui/components/dialog';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { toast } from '@buzzkit/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { SourceStatusBadge } from '@/app/components/badges';
import { mappedEventCount, providerLabel } from '@/app/components/sources/describe';
import { ProviderLogo } from '@/app/components/sources/logo';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { Time, TimeAgo } from '@/app/hooks/use-time-ago';
import { sourcesAction } from '@/app/lib/actions/sources.server';
import { listSources, type Source } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

const PROVIDERS = Object.values(SOURCE_PRESETS)
  .map((preset) => ({ value: preset.provider, label: preset.label }))
  .sort((a, b) => (a.value === 'custom' ? -1 : b.value === 'custom' ? 1 : 0));

export function meta() {
  return [{ title: 'Sources · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const sources = await listSources({ request, env }, token, params.slug, tenant);
  return { sources };
}

export const action = sourcesAction;

function CreateForm({ slug, onClose }: { slug: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { submit, pending } = useActionFetcher((data) => {
    onClose();
    if (typeof data.id === 'string') {
      toast.success(`Source “${name.trim()}” created`);
      navigate(`/${slug}/sources/${data.id}?setup`);
    }
  });
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<SourceProvider>('custom');
  const canCreate = name.trim().length > 0 && !pending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add source</DialogTitle>
      </DialogHeader>
      <FieldGroup className='w-full'>
        <Field>
          <FieldLabel htmlFor='source-name'>Name</FieldLabel>
          <Input
            id='source-name'
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder='Stripe billing'
            autoComplete='off'
            maxLength={100}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='source-provider'>Provider</FieldLabel>
          <Select
            value={provider}
            items={PROVIDERS}
            onValueChange={(value) => setProvider(value as SourceProvider)}
          >
            <SelectTrigger id='source-provider' className='w-full'>
              <SelectValue>
                {(value: unknown) => (
                  <span className='flex items-center gap-1.5'>
                    <ProviderLogo provider={String(value)} />
                    {providerLabel(String(value))}
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  <span className='flex items-center gap-1.5'>
                    <ProviderLogo provider={entry.value} />
                    {entry.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {provider === 'custom'
              ? 'Your own server posts JSON with a type, an id and the subscriber to a shared secret header.'
              : `${providerLabel(provider)} webhooks are verified and mapped to events with a default preset, which you can edit afterwards.`}
          </FieldDescription>
        </Field>
        <Button
          className='w-full'
          disabled={!canCreate}
          loading={pending}
          onClick={() => submit('create', { name: name.trim(), provider })}
        >
          Create source
        </Button>
      </FieldGroup>
    </>
  );
}

function SourceRow({ source, slug }: { source: Source; slug: string }) {
  const count = mappedEventCount(source.mapping);
  return (
    <TableRow>
      <TableCell className='font-medium text-fg-4'>
        <Link
          to={`/${slug}/sources/${source.id}`}
          className='flex min-w-0 flex-col outline-none focus-visible:underline'
        >
          <Truncate>{source.name}</Truncate>
          <Truncate className='font-normal text-fg-2 text-xs'>
            {count === 'all'
              ? 'Every type passes through'
              : `${count} ${count === 1 ? 'type' : 'types'} mapped to events`}
          </Truncate>
        </Link>
      </TableCell>
      <TableCell>
        <span className='flex items-center gap-1.5'>
          <ProviderLogo provider={source.provider} />
          {providerLabel(source.provider)}
        </span>
      </TableCell>
      <TableCell className='py-2'>
        <SourceStatusBadge status={source.status} />
      </TableCell>
      <TableCell>
        {source.lastDeliveryAt ? (
          <TimeAgo at={source.lastDeliveryAt} />
        ) : (
          <span className='text-fg-2'>Never</span>
        )}
      </TableCell>
      <TableCell>
        <Time at={source.createdAt} />
      </TableCell>
    </TableRow>
  );
}

export default function SourcesRoute({ loaderData, params }: Route.ComponentProps) {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const { sources } = loaderData;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const openDialog = () => {
    setOpened((count) => count + 1);
    setOpen(true);
  };

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Sources
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Turn webhooks from other services into subscriber events.
          </p>
        </div>
        {canManage && (
          <Button icon='IconPlusMedium' onClick={openDialog}>
            Add source
          </Button>
        )}
      </header>

      <Card className='min-h-0 shrink'>
        {sources.length === 0 ? (
          <EmptyState
            icon='IconMailboxFilled'
            title='No sources yet'
            description='Add a source to receive webhooks from Stripe, Superwall or your own server as events on the subscriber.'
            className='py-10'
          >
            {canManage && (
              <Button icon='IconPlusMedium' onClick={openDialog}>
                Add source
              </Button>
            )}
          </EmptyState>
        ) : (
          <Table className='table-fixed'>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className='w-28'>Provider</TableHead>
                <TableHead className='w-28'>Status</TableHead>
                <TableHead className='w-32'>Last delivery</TableHead>
                <TableHead className='w-32'>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <SourceRow key={source.id} source={source} slug={params.slug} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton>
          <CreateForm key={opened} slug={params.slug} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
