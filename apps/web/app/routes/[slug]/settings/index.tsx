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
import { Field, FieldDescription, FieldError, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { useState } from 'react';
import { useFetcher, useOutletContext } from 'react-router';
import { SettingsCard } from '@/app/components/settings/card';
import { type SettingsActionData, useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { workspaceSettingsAction } from '@/app/lib/actions/workspace.server';
import type { Workspace } from '@/app/lib/api.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SLUG_MESSAGE = 'Use 3 to 48 lowercase letters, numbers and single hyphens.';

export const action = workspaceSettingsAction;

function WorkspaceCard({ workspace, canEdit }: { workspace: Workspace; canEdit: boolean }) {
  const { submit, pending } = useActionFetcher();
  const [name, setName] = useState(workspace.name);
  const trimmed = name.trim();
  const dirty = trimmed.length > 0 && trimmed !== workspace.name;
  const save = () => submit('update', { name: trimmed });

  return (
    <SettingsCard
      title='Workspace'
      description='The name your team sees across BuzzKit.'
      footer={
        canEdit
          ? 'Shown in the workspace switcher and on invites.'
          : 'Only admins and owners can edit the workspace.'
      }
      action={
        canEdit ? (
          <Button size='xs' disabled={!dirty || pending} onClick={save}>
            Save
          </Button>
        ) : undefined
      }
    >
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && dirty && !pending) save();
        }}
        aria-label='Workspace name'
        maxLength={100}
        readOnly={!canEdit}
        className='max-w-xs'
      />
    </SettingsCard>
  );
}

function SlugCard({ workspace, canEdit }: { workspace: Workspace; canEdit: boolean }) {
  const fetcher = useFetcher<SettingsActionData>();
  const pending = fetcher.state !== 'idle';
  const [slug, setSlug] = useState(workspace.slug);
  const [clientError, setClientError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const trimmed = slug.trim().toLowerCase();
  const dirty = trimmed.length > 0 && trimmed !== workspace.slug;
  const serverError = trimmed === submitted && fetcher.state === 'idle' ? fetcher.data?.error : undefined;
  const error = clientError ?? serverError ?? null;

  const save = () => {
    if (trimmed.length < 3 || trimmed.length > 48 || !SLUG_PATTERN.test(trimmed)) {
      setClientError(SLUG_MESSAGE);
      return;
    }
    setClientError(null);
    setSubmitted(trimmed);
    fetcher.submit({ intent: 'set-slug', slug: trimmed }, { method: 'post' });
  };

  return (
    <SettingsCard
      title='Slug'
      description='Your workspace URL on the dashboard and in the API.'
      footer={canEdit ? 'Changing it moves every link.' : 'Only admins and owners can edit the workspace.'}
      action={
        canEdit ? (
          <Button size='xs' disabled={!dirty || pending} onClick={save}>
            Save
          </Button>
        ) : undefined
      }
    >
      <Field data-invalid={error ? true : undefined} className='max-w-xs'>
        <Input
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value);
            setClientError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && dirty && !pending) save();
          }}
          aria-label='Slug'
          maxLength={48}
          readOnly={!canEdit}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'slug-error' : 'slug-hint'}
        />
        {error ? (
          <FieldError id='slug-error'>{error}</FieldError>
        ) : (
          <FieldDescription id='slug-hint'>Lowercase letters, numbers and hyphens.</FieldDescription>
        )}
      </Field>
    </SettingsCard>
  );
}

function DeleteCard({ workspace }: { workspace: Workspace }) {
  const { submit, pending } = useActionFetcher();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const openChange = (next: boolean) => {
    setOpen(next);
    if (!next) setConfirm('');
  };

  return (
    <>
      <SettingsCard
        title='Delete workspace'
        description='Delete this workspace and everything in it.'
        footer='Every tenant, subscriber, key and message goes with it.'
        action={
          <Button size='xs' variant='destructive' onClick={() => setOpen(true)}>
            Delete workspace
          </Button>
        }
      />
      <AlertDialog open={open} onOpenChange={openChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{workspace.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Every tenant, subscriber, key and message goes with it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field className='w-full'>
            <FieldLabel htmlFor='delete-confirm'>
              <span>
                Type <span className='text-fg-4'>{workspace.slug}</span> to confirm
              </span>
            </FieldLabel>
            <Input
              id='delete-confirm'
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && confirm.trim() === workspace.slug && !pending)
                  submit('delete', { confirm: confirm.trim() });
              }}
              autoComplete='off'
              spellCheck={false}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={confirm.trim() !== workspace.slug || pending}
              onClick={() => submit('delete', { confirm: confirm.trim() })}
            >
              Delete workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function SettingsGeneralRoute() {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const canEdit = workspace.role === 'owner' || workspace.role === 'admin';

  return (
    <>
      <header className='flex flex-col gap-0.5'>
        <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
          General
        </h1>
        <p className='text-pretty text-base text-fg-2 leading-tighter'>Manage the workspace name and slug.</p>
      </header>
      <WorkspaceCard key={`name:${workspace.name}`} workspace={workspace} canEdit={canEdit} />
      <SlugCard key={`slug:${workspace.slug}`} workspace={workspace} canEdit={canEdit} />
      {workspace.role === 'owner' && <DeleteCard workspace={workspace} />}
    </>
  );
}
