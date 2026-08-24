import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@buzzkit/ui/components/alert-dialog';
import { Badge } from '@buzzkit/ui/components/badge';
import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@buzzkit/ui/components/dialog';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { Input } from '@buzzkit/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { Spinner } from '@buzzkit/ui/components/spinner';
import { Switch } from '@buzzkit/ui/components/switch';
import { Textarea } from '@buzzkit/ui/components/textarea';
import { useEffect, useState } from 'react';
import { cloudflareContext } from '@/app/cloudflare';
import { CHANNELS } from '@/app/components/onboarding/catalog';
import { slugify } from '@/app/components/workspace/fields';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { topicsAction } from '@/app/lib/actions/topics.server';
import { listTopics, type Topic } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import type { Route } from './+types/index';

const AVAILABLE_CHANNELS = CHANNELS.filter((channel) => channel.available);

export function meta() {
  return [{ title: 'Topics · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  return { topics: await listTopics({ request, env }, token, params.slug, 'default') };
}

export const action = topicsAction;

type ChannelChoice = 'default' | 'in' | 'out';

const CHOICES: { value: ChannelChoice; label: string }[] = [
  { value: 'default', label: 'Follow topic default' },
  { value: 'in', label: 'Opted in' },
  { value: 'out', label: 'Opted out' },
];

function choiceFor(topic: Topic | null, channel: string): ChannelChoice {
  const value = (topic?.channelDefaults as Record<string, boolean> | null)?.[channel];
  return value === undefined ? 'default' : value ? 'in' : 'out';
}

function TopicDialog({
  topic,
  open,
  onOpenChange,
}: {
  topic: Topic | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { submit, pending } = useActionFetcher(() => onOpenChange(false));
  const [name, setName] = useState(topic?.name ?? '');
  const [slug, setSlug] = useState(topic?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(topic));
  const [optedIn, setOptedIn] = useState(topic?.defaultOptedIn ?? true);
  const [choices, setChoices] = useState<Record<string, ChannelChoice>>(() =>
    Object.fromEntries(AVAILABLE_CHANNELS.map((channel) => [channel.id, choiceFor(topic, channel.id)]))
  );

  useEffect(() => {
    if (!open) return;
    setName(topic?.name ?? '');
    setSlug(topic?.slug ?? '');
    setSlugTouched(Boolean(topic));
    setOptedIn(topic?.defaultOptedIn ?? true);
    setChoices(
      Object.fromEntries(AVAILABLE_CHANNELS.map((channel) => [channel.id, choiceFor(topic, channel.id)]))
    );
  }, [open, topic]);

  const slugValue = slugTouched ? slug : slugify(name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{topic ? 'Edit topic' : 'New topic'}</DialogTitle>
        </DialogHeader>
        <form
          className='flex w-full flex-col gap-5'
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const fields: Record<string, string> = {
              name,
              slug: slugValue,
              description: String(form.get('description') ?? ''),
              defaultOptedIn: String(optedIn),
            };
            for (const [channel, choice] of Object.entries(choices)) fields[`channel:${channel}`] = choice;
            if (topic) fields.topic = topic.slug;
            submit(topic ? 'update' : 'create', fields);
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='topic-name'>Name</FieldLabel>
              <Input
                id='topic-name'
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder='Running reminders'
                required
                maxLength={100}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='topic-slug'>Slug</FieldLabel>
              <Input
                id='topic-slug'
                value={slugValue}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                placeholder='running-reminders'
                required
                maxLength={64}
                aria-describedby='topic-slug-description'
              />
              <FieldDescription id='topic-slug-description'>
                What your code sends to and subscribers opt into.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor='topic-description'>Description</FieldLabel>
              <Textarea
                id='topic-description'
                name='description'
                defaultValue={topic?.description ?? ''}
                placeholder='Shown to users in their notification settings.'
                maxLength={500}
                rows={2}
              />
            </Field>
            <Field orientation='horizontal'>
              <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <FieldLabel htmlFor='topic-default'>Opted in by default</FieldLabel>
                <FieldDescription>New subscribers receive this topic until they opt out.</FieldDescription>
              </span>
              <Switch id='topic-default' checked={optedIn} onCheckedChange={setOptedIn} />
            </Field>
            {AVAILABLE_CHANNELS.map((channel) => (
              <Field key={channel.id} orientation='horizontal'>
                <FieldLabel className='flex-1'>{channel.name}</FieldLabel>
                <Select
                  items={CHOICES}
                  value={choices[channel.id] ?? 'default'}
                  onValueChange={(value) =>
                    setChoices((current) => ({ ...current, [channel.id]: value as ChannelChoice }))
                  }
                >
                  <SelectTrigger className='w-44' aria-label={`${channel.name} default`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHOICES.map((choice) => (
                      <SelectItem key={choice.value} value={choice.value}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
            <Button type='submit' className='w-full' disabled={pending || !name.trim() || !slugValue}>
              {pending && <Spinner />}
              {topic ? 'Save changes' : 'Create topic'}
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TopicRow({ topic, onEdit }: { topic: Topic; onEdit: () => void }) {
  const { submit, pending } = useActionFetcher();
  const defaults = (topic.channelDefaults ?? {}) as Record<string, boolean>;

  return (
    <li className='flex min-h-14 items-center gap-3 px-4 py-2.5'>
      <IconTile icon='IconTagFilled' size='sm' />
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='flex min-w-0 items-center gap-1.5'>
          <span className='truncate font-medium text-fg-4 text-sm leading-tighter'>{topic.name}</span>
          <span className='truncate text-fg-2 text-xs'>{topic.slug}</span>
        </span>
        <span className='truncate text-fg-2 text-xs'>
          {topic.description ?? (topic.defaultOptedIn ? 'Opted in by default' : 'Opted out by default')}
        </span>
      </span>
      <span className='flex shrink-0 items-center gap-1.5'>
        {AVAILABLE_CHANNELS.map((channel) => {
          const resolved = defaults[channel.id] ?? topic.defaultOptedIn;
          return (
            <Badge key={channel.id} variant={resolved ? 'green' : 'default'} size='sm'>
              {channel.name} {resolved ? 'on' : 'off'}
            </Badge>
          );
        })}
      </span>
      <Button
        variant='ghost'
        size='icon-xs'
        icon='IconPencil'
        aria-label={`Edit ${topic.name}`}
        onClick={onEdit}
      />
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant='ghost'
              size='icon-xs'
              icon='IconTrashCan'
              aria-label={`Delete ${topic.name}`}
              disabled={pending}
            />
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{topic.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from every subscriber's preferences and sends to it stop. Its slug becomes free
              again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => submit('delete', { topic: topic.slug })}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export default function TopicsRoute({ loaderData }: Route.ComponentProps) {
  const { topics } = loaderData;
  const [editing, setEditing] = useState<Topic | null>(null);
  const [open, setOpen] = useState(false);

  const openDialog = (topic: Topic | null) => {
    setEditing(topic);
    setOpen(true);
  };

  return (
    <div className='flex w-full flex-col gap-5'>
      <header className='flex items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Topics
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>Manage notification topics.</p>
        </div>
        <Button icon='IconPlusMedium' onClick={() => openDialog(null)}>
          New topic
        </Button>
      </header>

      {topics.length === 0 ? (
        <EmptyState
          icon='IconTagFilled'
          title='No topics yet'
          description='Topics like "deals" or "running reminders" let users choose which notifications they get, without you building a settings table.'
        >
          <Button onClick={() => openDialog(null)}>Create your first topic</Button>
        </EmptyState>
      ) : (
        <Card>
          <ul className='flex flex-col divide-y divide-bg-3'>
            {topics.map((topic) => (
              <TopicRow key={topic.id} topic={topic} onEdit={() => openDialog(topic)} />
            ))}
          </ul>
        </Card>
      )}

      <TopicDialog topic={editing} open={open} onOpenChange={setOpen} />
    </div>
  );
}
