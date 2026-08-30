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
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { toast } from '@buzzkit/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { Time } from '@/app/hooks/use-time-ago';
import { secretsAction } from '@/app/lib/actions/secrets.server';
import { listSecrets } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Secrets · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const secrets = await listSecrets({ request, env }, token, params.slug, tenant);
  return { secrets };
}

export const action = secretsAction;

function copyToClipboard(value: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success('Copied to clipboard'),
    () => toast.error('Unable to copy', { description: 'Select the reference and copy it manually.' })
  );
}

function SecretDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: string | null;
}) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const { submit, pending } = useActionFetcher((data) => {
    onOpenChange(false);
    setName('');
    setValue('');
    toast.success(existing ? `Secret “${String(data.name)}” updated` : `Secret “${String(data.name)}” added`);
  });

  const finalName = existing ?? name.trim();
  const canSave = finalName.length > 0 && value.length > 0 && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{existing ? `Update “${existing}”` : 'Add secret'}</DialogTitle>
        </DialogHeader>
        <FieldGroup className='w-full'>
          {!existing && (
            <Field>
              <FieldLabel htmlFor='secret-name'>Name</FieldLabel>
              <Input
                id='secret-name'
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder='api'
                autoComplete='off'
                spellCheck={false}
                maxLength={48}
              />
              <FieldDescription>
                Read in a workflow as {`{{ secrets.${name.trim() || '<name>'} }}`}.
              </FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor='secret-value'>{existing ? 'New value' : 'Value'}</FieldLabel>
            <Input
              id='secret-value'
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder='sk_live_…'
              autoComplete='off'
              spellCheck={false}
              data-1p-ignore
              data-lpignore='true'
              data-bwignore
              maxLength={4096}
            />
            <FieldDescription>Stored with the tenant and never shown again.</FieldDescription>
          </Field>
          <Button
            className='w-full'
            disabled={!canSave}
            loading={pending}
            onClick={() => submit('secret-set', { name: finalName, value })}
          >
            {existing ? 'Save value' : 'Add secret'}
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}

export default function SecretsRoute({ loaderData }: Route.ComponentProps) {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const { secrets } = loaderData;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const { submit, pending } = useActionFetcher((data) => {
    setRemoveOpen(false);
    if (typeof data.removed === 'string') toast.success(`Secret “${data.removed}” removed`);
  });

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Secrets
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Manage the secrets your workflows can access.
          </p>
        </div>
        {canManage && (
          <Button
            icon='IconPlusMedium'
            onClick={() => {
              setEditing(null);
              setAddOpen(true);
            }}
          >
            Add secret
          </Button>
        )}
      </header>

      <Card className='min-h-0 shrink'>
        {secrets.length === 0 ? (
          <EmptyState
            icon='IconShieldFilled'
            title='No secrets yet'
            description='Add a secret and your workflows can read it without the value ever appearing in a definition.'
            className='py-10'
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className='w-0' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {secrets.map((entry) => (
                <TableRow key={entry.name}>
                  <TableCell className='font-medium text-fg-4'>{entry.name}</TableCell>
                  <TableCell className='text-fg-2'>{`{{ secrets.${entry.name} }}`}</TableCell>
                  <TableCell className='tabular-nums'>{entry.version}</TableCell>
                  <TableCell>
                    <Time at={entry.updatedAt} />
                  </TableCell>
                  <TableCell>
                    <Time at={entry.createdAt} />
                  </TableCell>
                  <TableCell className='w-0 py-1.5 text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant='ghost'
                            size='icon-xs'
                            icon='IconDotGrid1x3Horizontal'
                            aria-label='Secret actions'
                          />
                        }
                      />
                      <DropdownMenuContent align='end'>
                        <DropdownMenuItem onClick={() => copyToClipboard(`{{ secrets.${entry.name} }}`)}>
                          Copy reference
                        </DropdownMenuItem>
                        {canManage && (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(entry.name);
                                setAddOpen(true);
                              }}
                            >
                              Update value
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant='destructive'
                              onClick={() => {
                                setRemoving(entry.name);
                                setRemoveOpen(true);
                              }}
                            >
                              Remove
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <SecretDialog key={editing ?? 'new'} open={addOpen} onOpenChange={setAddOpen} existing={editing} />
      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Fetch steps that read it fail from the next run on.
              <span className='block'>This cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={() => removing && submit('secret-remove', { name: removing })}
            >
              Remove secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
