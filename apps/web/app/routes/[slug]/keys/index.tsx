import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@buzzkit/ui/components/alert-dialog';
import { Badge } from '@buzzkit/ui/components/badge';
import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@buzzkit/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { type ScopeGroup, ScopePicker } from '@buzzkit/ui/components/scope-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { toast } from '@buzzkit/ui/components/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from '@buzzkit/ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { Time } from '@/app/hooks/use-time-ago';
import { keysAction } from '@/app/lib/actions/keys.server';
import { type ApiKey, listKeys, listTenants } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import { paginate, readPage } from '@/app/lib/utils/pagination';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

type KeyKind = 'workspace' | 'tenant' | 'client';
type Preset = 'full' | 'read' | 'custom';
type KeyScopeGroup = ScopeGroup & { wildcard: string; tenant: boolean };

const SCOPE_GROUPS: KeyScopeGroup[] = [
  {
    label: 'workspace',
    wildcard: 'workspace:*',
    options: ['workspace:read', 'workspace:write'],
    tenant: false,
  },
  { label: 'members', wildcard: 'members:*', options: ['members:read'], tenant: false },
  { label: 'tenants', wildcard: 'tenants:*', options: ['tenants:read', 'tenants:write'], tenant: false },
  { label: 'events', wildcard: 'events:*', options: ['events:read'], tenant: false },
  {
    label: 'credentials',
    wildcard: 'credentials:*',
    options: ['credentials:read', 'credentials:write'],
    tenant: true,
  },
  {
    label: 'subscribers',
    wildcard: 'subscribers:*',
    options: ['subscribers:read', 'subscribers:write'],
    tenant: true,
  },
  {
    label: 'subscriptions',
    wildcard: 'subscriptions:*',
    options: ['subscriptions:read', 'subscriptions:write'],
    tenant: true,
  },
  { label: 'topics', wildcard: 'topics:*', options: ['topics:read', 'topics:write'], tenant: true },
  { label: 'messages', wildcard: 'messages:*', options: ['messages:read', 'messages:send'], tenant: true },
];

const KINDS: { value: KeyKind; label: string }[] = [
  { value: 'workspace', label: 'Workspace' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'client', label: 'Client' },
];

const KIND_BADGE: Record<KeyKind, 'blue' | 'purple' | 'green'> = {
  workspace: 'blue',
  tenant: 'purple',
  client: 'green',
};

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'full', label: 'Full access' },
  { value: 'read', label: 'Read only' },
  { value: 'custom', label: 'Custom' },
];

export function meta() {
  return [{ title: 'API keys · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };
  const [page, tenants] = await Promise.all([
    listKeys(ctx, token, params.slug, readPage(request)),
    listTenants(ctx, token, params.slug),
  ]);
  return { ...paginate(request, page), tenants };
}

export const action = keysAction;

function groupsFor(kind: KeyKind): KeyScopeGroup[] {
  return kind === 'tenant' ? SCOPE_GROUPS.filter((group) => group.tenant) : SCOPE_GROUPS;
}

function firstUseSnippet(apiUrl: string, kind: KeyKind, secret: string) {
  if (kind === 'client') {
    return [
      `curl -X POST ${apiUrl}/v1/client/identify \\`,
      `  -H 'Authorization: Bearer ${secret}' \\`,
      "  -H 'Content-Type: application/json' \\",
      `  -d '{ "externalId": "user_42" }'`,
    ].join('\n');
  }
  return [
    `curl -X PUT ${apiUrl}/v1/subscribers/user_42 \\`,
    `  -H 'Authorization: Bearer ${secret}' \\`,
    "  -H 'Content-Type: application/json' \\",
    `  -d '{ "email": "jane@acme.com" }'`,
  ].join('\n');
}

function KeyDialog({
  open,
  onOpenChange,
  tenants,
  apiUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenants: { id: string; name: string; slug: string; isDefault: boolean }[];
  apiUrl: string;
}) {
  const defaultTenant = tenants.find((entry) => entry.isDefault)?.slug ?? tenants[0]?.slug ?? '';
  const [name, setName] = useState('');
  const [kind, setKind] = useState<KeyKind>('workspace');
  const [tenant, setTenant] = useState(defaultTenant);
  const [preset, setPreset] = useState<Preset>('full');
  const [scopes, setScopes] = useState<string[]>([]);
  const [created, setCreated] = useState<{ secret: string; kind: KeyKind } | null>(null);
  const { submit, pending } = useActionFetcher((data) => {
    if (typeof data.secret === 'string')
      setCreated({ secret: data.secret, kind: (data.kind as KeyKind) ?? 'workspace' });
    else onOpenChange(false);
  });

  useEffect(() => {
    if (!open) return;
    setName('');
    setKind('workspace');
    setTenant(defaultTenant);
    setPreset('full');
    setScopes([]);
    setCreated(null);
  }, [open, defaultTenant]);

  const groups = groupsFor(kind);
  const selected =
    kind === 'client'
      ? []
      : preset === 'full'
        ? ['*']
        : preset === 'read'
          ? groups.flatMap((group) => group.options.filter((option) => option.endsWith(':read')))
          : scopes;
  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && (kind === 'client' || selected.length > 0) && !pending;

  const create = () => submit('create', { name: trimmed, kind, tenant, scopes: JSON.stringify(selected) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your key</DialogTitle>
            </DialogHeader>
            <div className='flex w-full flex-col gap-3'>
              <CodeBlock code={created.secret} className='w-full' />
              <span className='font-medium text-fg-2 text-xs'>Use it right away</span>
              <CodeBlock code={firstUseSnippet(apiUrl, created.kind, created.secret)} className='w-full' />
              <Button className='w-full' onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
            </DialogHeader>
            <FieldGroup className='w-full'>
              <Field>
                <FieldLabel htmlFor='key-name'>Name</FieldLabel>
                <Input
                  id='key-name'
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={kind === 'client' ? 'iOS app' : 'Production backend'}
                  maxLength={100}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='key-kind'>Type</FieldLabel>
                <Select items={KINDS} value={kind} onValueChange={(value) => setKind(value as KeyKind)}>
                  <SelectTrigger id='key-kind' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {kind === 'workspace'
                    ? 'Workspace keys can access every tenant and are meant for your backend.'
                    : kind === 'tenant'
                      ? "Tenant keys are scoped to a single tenant and can't reach anything outside it."
                      : 'Client keys can be embedded directly in your app and used with the SDK.'}
                </FieldDescription>
              </Field>
              {kind !== 'workspace' && (
                <Field>
                  <FieldLabel htmlFor='key-tenant'>Tenant</FieldLabel>
                  <Select
                    items={tenants.map((entry) => ({ value: entry.slug, label: entry.name }))}
                    value={tenant}
                    onValueChange={(value) => setTenant(String(value))}
                  >
                    <SelectTrigger id='key-tenant' className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants.map((entry) => (
                        <SelectItem key={entry.id} value={entry.slug}>
                          {entry.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {kind !== 'client' && (
                <Field>
                  <FieldLabel htmlFor='key-preset'>Permissions</FieldLabel>
                  <Select
                    items={PRESETS}
                    value={preset}
                    onValueChange={(value) => setPreset(value as Preset)}
                  >
                    <SelectTrigger id='key-preset' className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRESETS.map((entry) => (
                        <SelectItem key={entry.value} value={entry.value}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {preset === 'full'
                      ? 'Everything, including permissions added later.'
                      : preset === 'read'
                        ? 'Read access to every resource. Cannot change anything.'
                        : 'Pick exactly what this key can do.'}
                  </FieldDescription>
                </Field>
              )}
              {kind !== 'client' && preset === 'custom' && (
                <Field>
                  <FieldLabel>Custom permissions</FieldLabel>
                  <ScopePicker groups={groups} selected={scopes} onChange={setScopes} />
                </Field>
              )}
              <Button className='w-full' disabled={!canCreate} loading={pending} onClick={create}>
                Create key
              </Button>
            </FieldGroup>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function copyToClipboard(value: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success('Copied to clipboard'),
    () => toast.error('Unable to copy', { description: 'Select the key and copy it manually.' })
  );
}

function ScopeSummary({ apiKey }: { apiKey: ApiKey }) {
  if (apiKey.kind === 'client') return <span className='text-fg-2'>Client API</span>;
  if (apiKey.scopes.includes('*')) return <>Full access</>;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className='cursor-default underline decoration-dotted decoration-fg-1 underline-offset-3'>
            {apiKey.scopes.length} scope{apiKey.scopes.length === 1 ? '' : 's'}
          </span>
        }
      />
      <TooltipContent>
        <span className='flex flex-col gap-0.5 font-mono text-xs'>
          {apiKey.scopes.map((scope) => (
            <span key={scope}>{scope}</span>
          ))}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function KeyRow({
  apiKey,
  tenantName,
  canManage,
  onRevoke,
}: {
  apiKey: ApiKey;
  tenantName: string | null;
  canManage: boolean;
  onRevoke: (key: ApiKey) => void;
}) {
  const copyable = apiKey.kind === 'client' && apiKey.token;

  return (
    <TableRow className={apiKey.revokedAt ? 'opacity-60' : undefined}>
      <TableCell className='font-medium text-fg-4'>
        <span className='flex items-center gap-1.5'>
          {apiKey.name}
          {apiKey.revokedAt && (
            <Badge size='sm' variant='red'>
              Revoked
            </Badge>
          )}
        </span>
      </TableCell>
      <TableCell className='font-mono text-xs'>
        {apiKey.prefix}…{apiKey.last4}
      </TableCell>
      <TableCell>
        <Badge size='sm' variant={KIND_BADGE[apiKey.kind]}>
          {KINDS.find((entry) => entry.value === apiKey.kind)?.label}
        </Badge>
      </TableCell>
      <TableCell>{tenantName ?? <span className='text-fg-2'>All tenants</span>}</TableCell>
      <TableCell>
        <ScopeSummary apiKey={apiKey} />
      </TableCell>
      <TableCell>
        {apiKey.lastUsedAt ? <Time at={apiKey.lastUsedAt} /> : <span className='text-fg-2'>Never</span>}
      </TableCell>
      <TableCell>
        <Time at={apiKey.createdAt} />
      </TableCell>
      <TableCell className='w-0 py-1.5 text-right'>
        {!apiKey.revokedAt && (canManage || copyable) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-xs'
                  icon='IconDotGrid1x3Horizontal'
                  aria-label='Key actions'
                />
              }
            />
            <DropdownMenuContent align='end'>
              {copyable && (
                <DropdownMenuItem onClick={() => copyToClipboard(apiKey.token as string)}>
                  Copy key
                </DropdownMenuItem>
              )}
              {canManage && (
                <DropdownMenuItem variant='destructive' onClick={() => onRevoke(apiKey)}>
                  Revoke
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function KeysRoute({ loaderData }: Route.ComponentProps) {
  const { workspace, apiUrl } = useOutletContext<WorkspaceOutletContext>();
  const { items: keys, pagination, tenants } = loaderData;
  const [open, setOpen] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const { submit, pending } = useActionFetcher(() => setRevokeOpen(false));
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const tenantName = (tenantId: string | null) =>
    tenants.find((entry) => entry.id === tenantId)?.name ?? null;

  const openRevoke = (key: ApiKey) => {
    setRevoking(key);
    setRevokeOpen(true);
  };

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            API keys
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>Manage your workspace API keys.</p>
        </div>
        {canManage && (
          <Button icon='IconPlusMedium' onClick={() => setOpen(true)}>
            Create key
          </Button>
        )}
      </header>

      <Card className='min-h-0 shrink'>
        {keys.length === 0 ? (
          <EmptyState
            icon='IconKeyholeFilled'
            title='No API keys yet'
            description='Create a key to call the API from your backend, or a client key to embed in your app.'
            className='py-10'
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>
                  <span className='sr-only'>Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((apiKey) => (
                <KeyRow
                  key={apiKey.id}
                  apiKey={apiKey}
                  tenantName={tenantName(apiKey.tenantId)}
                  canManage={canManage}
                  onRevoke={openRevoke}
                />
              ))}
            </TableBody>
            <TablePagination {...pagination} />
          </Table>
        )}
      </Card>

      <KeyDialog open={open} onOpenChange={setOpen} tenants={tenants} apiUrl={apiUrl} />

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revoking?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Requests with this key start failing immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={() => revoking && submit('revoke', { id: revoking.id })}
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
