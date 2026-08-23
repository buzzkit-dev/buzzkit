import { Button } from '@buzzkit/ui/components/button';
import { Field, FieldDescription, FieldError } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { useEffect, useState } from 'react';
import { useFetcher, useOutletContext } from 'react-router';
import { SettingsCard } from '@/app/components/settings/card';
import { type SettingsActionData, useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { workspaceSettingsAction } from '@/app/lib/actions/workspace.server';
import type { Workspace } from '@/app/lib/api.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';

export const action = workspaceSettingsAction;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MESSAGE = 'Use 3 to 48 lowercase letters, numbers and single hyphens.';

function WorkspaceCard({ workspace, canEdit }: { workspace: Workspace; canEdit: boolean }) {
  const [name, setName] = useState(workspace.name);
  const { submit, pending } = useActionFetcher();

  useEffect(() => setName(workspace.name), [workspace.name]);

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
  const [slug, setSlug] = useState(workspace.slug);
  const [clientError, setClientError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const fetcher = useFetcher<SettingsActionData>();
  const pending = fetcher.state !== 'idle';

  useEffect(() => setSlug(workspace.slug), [workspace.slug]);

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

export default function SettingsGeneralRoute() {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const canEdit = workspace.role === 'owner' || workspace.role === 'admin';

  return (
    <>
      <WorkspaceCard workspace={workspace} canEdit={canEdit} />
      <SlugCard workspace={workspace} canEdit={canEdit} />
    </>
  );
}
