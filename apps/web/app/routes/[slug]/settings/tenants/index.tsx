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
import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@buzzkit/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { Table, TableBody, TableCell, TableRow } from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { DefaultTenantBadge } from '@/app/components/badges';
import { Deferred } from '@/app/components/loading/deferred';
import { type TableColumn, TableColumns, TableSkeleton } from '@/app/components/loading/table';
import { slugify } from '@/app/components/workspace/fields';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { Time } from '@/app/hooks/use-time-ago';
import { tenantsAction } from '@/app/lib/actions/tenants.server';
import { listTenants, type Tenant } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Tenants · BuzzKit' }];
}

const COLUMNS: TableColumn[] = [
  {
    label: 'Tenant',
    className: 'max-w-96',
    content: (
      <span className='flex flex-col gap-1'>
        <Skeleton className='h-3.5 w-36' />
        <Skeleton className='h-3 w-24' />
      </span>
    ),
  },
  { label: 'Id', fill: 'h-4 w-52' },
  { label: 'Created', fill: 'h-4 w-24' },
  { key: 'actions', label: 'Actions', hidden: true, className: 'w-0', fill: 'h-6 w-6 rounded-lg' },
];

export function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  return { tenants: listTenants({ request, env }, token, params.slug) };
}

export const action = tenantsAction;

function TenantDialog({
  tenant,
  open,
  onOpenChange,
}: {
  tenant: Tenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { submit, pending } = useActionFetcher(() => onOpenChange(false));
  const slugLocked = tenant?.isDefault ?? false;
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const slugValue = slugTouched ? slug : slugify(name);
  const valid = name.trim().length > 0 && slugValue.length > 0;
  const save = () => {
    if (!valid || pending) return;
    void submit(tenant ? 'update' : 'create', {
      ...(tenant ? { tenant: tenant.slug } : {}),
      name: name.trim(),
      slug: slugLocked ? tenant!.slug : slugValue,
    });
  };

  useEffect(() => {
    if (!open) return;
    setName(tenant?.name ?? '');
    setSlug(tenant?.slug ?? '');
    setSlugTouched(tenant !== null);
  }, [open, tenant]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{tenant ? 'Edit tenant' : 'Create tenant'}</DialogTitle>
        </DialogHeader>
        <FieldGroup className='w-full'>
          <Field>
            <FieldLabel htmlFor='tenant-name'>Name</FieldLabel>
            <Input
              id='tenant-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder='Customer One'
              maxLength={100}
              autoComplete='off'
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='tenant-slug'>Slug</FieldLabel>
            <Input
              id='tenant-slug'
              value={slugLocked ? tenant!.slug : slugValue}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value.toLowerCase());
              }}
              placeholder='customer-one'
              maxLength={48}
              autoComplete='off'
              spellCheck={false}
              readOnly={slugLocked}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
            />
            <FieldDescription>
              {slugLocked
                ? 'The default tenant’s slug cannot be changed.'
                : 'The address of this tenant in the API and in tenant keys. Lowercase letters, numbers and hyphens.'}
            </FieldDescription>
          </Field>
          <Button className='w-full' disabled={!valid || pending} loading={pending} onClick={save}>
            {tenant ? 'Save changes' : 'Create tenant'}
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}

function TenantRow({
  tenant,
  canManage,
  onEdit,
  onDelete,
}: {
  tenant: Tenant;
  canManage: boolean;
  onEdit: (tenant: Tenant) => void;
  onDelete: (tenant: Tenant) => void;
}) {
  return (
    <TableRow>
      <TableCell className='max-w-96 py-2'>
        <span className='flex min-w-0 flex-col'>
          <span className='flex items-center gap-1.5'>
            <Truncate className='font-medium text-fg-4'>{tenant.name}</Truncate>
            <DefaultTenantBadge isDefault={tenant.isDefault} />
          </span>
          <Truncate className='text-fg-2 text-xs'>{tenant.slug}</Truncate>
        </span>
      </TableCell>
      <TableCell>
        <Truncate className='block max-w-64'>{tenant.id}</Truncate>
      </TableCell>
      <TableCell>
        <Time at={tenant.createdAt} />
      </TableCell>
      <TableCell className='w-0 py-1.5 text-right'>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-xs'
                  icon='IconDotGrid1x3Horizontal'
                  aria-label='Tenant actions'
                />
              }
            />
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => onEdit(tenant)}>Edit</DropdownMenuItem>
              {!tenant.isDefault && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant='destructive' onClick={() => onDelete(tenant)}>
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function TenantsRoute({ loaderData }: Route.ComponentProps) {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const { submit, pending } = useActionFetcher(() => setDeleteOpen(false));
  const { tenants } = loaderData;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Tenant | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Tenants
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Manage the tenants in this workspace.
          </p>
        </div>
        {canManage && (
          <Button
            icon='IconPlusMedium'
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Create tenant
          </Button>
        )}
      </header>

      <Deferred resolve={tenants}>
        {(data) => {
          const rows = data ?? [];
          if (data === undefined) return <TableSkeleton columns={COLUMNS} fixed={false} />;
          return (
            <Card className='min-h-0 shrink'>
              <Table>
                <TableColumns columns={COLUMNS} />
                <TableBody>
                  {rows.map((tenant) => (
                    <TenantRow
                      key={tenant.id}
                      tenant={tenant}
                      canManage={canManage}
                      onEdit={(target) => {
                        setEditing(target);
                        setDialogOpen(true);
                      }}
                      onDelete={(target) => {
                        setDeleting(target);
                        setDeleteOpen(true);
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </Card>
          );
        }}
      </Deferred>

      <TenantDialog tenant={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its subscribers, credentials and keys stop working immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={() => deleting && submit('delete', { tenant: deleting.slug })}
            >
              Delete tenant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
