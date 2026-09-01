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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { Switch } from '@buzzkit/ui/components/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from '@buzzkit/ui/components/table';
import { Textarea } from '@buzzkit/ui/components/textarea';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { Fragment, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { OptInBadge } from '@/app/components/badges';
import { CHANNELS } from '@/app/components/onboarding/catalog';
import { slugify } from '@/app/components/workspace/fields';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { Time } from '@/app/hooks/use-time-ago';
import { topicsAction } from '@/app/lib/actions/topics.server';
import { listTopicCategories, listTopics, type Topic } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { paginate, readPage } from '@/app/lib/utils/pagination';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

const AVAILABLE_CHANNELS = CHANNELS.filter((channel) => channel.available);

const COLUMN_LABELS: Record<string, string> = { push: 'Push' };

const CHOICES: { value: ChannelChoice; label: string }[] = [
  { value: 'default', label: 'Follow topic default' },
  { value: 'in', label: 'Opted in' },
  { value: 'out', label: 'Opted out' },
  { value: 'off', label: 'Not offered' },
];

type ChannelChoice = 'off' | 'default' | 'in' | 'out';

export function meta() {
  return [{ title: 'Topics · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const [page, categories] = await Promise.all([
    listTopics({ request, env }, token, params.slug, tenant, readPage(request)),
    listTopicCategories({ request, env }, token, params.slug, tenant),
  ]);
  return { ...paginate(request, page), categories: categories.items };
}

export const action = topicsAction;

function offers(topic: Topic | null, channel: string): boolean {
  return topic?.channels.includes(channel as Topic['channels'][number]) ?? false;
}

function resolvedFor(topic: Topic, channel: string): boolean {
  return (topic.channelDefaults as Record<string, boolean> | null)?.[channel] ?? topic.defaultOptedIn;
}

function choiceFor(topic: Topic | null, channel: string): ChannelChoice {
  if (topic && !offers(topic, channel)) return 'off';
  const value = (topic?.channelDefaults as Record<string, boolean> | null)?.[channel];
  return value === undefined ? 'default' : value ? 'in' : 'out';
}

function channelsFor(connected: string[], topic: Topic | null) {
  const shown = AVAILABLE_CHANNELS.filter(
    (channel) => connected.includes(channel.id) || offers(topic, channel.id)
  );
  return shown.length > 0 ? shown : AVAILABLE_CHANNELS;
}

function choicesFor(channels: typeof AVAILABLE_CHANNELS, topic: Topic | null): Record<string, ChannelChoice> {
  return Object.fromEntries(channels.map((channel) => [channel.id, choiceFor(topic, channel.id)]));
}

const NEW_CATEGORY = '__new__';
const NO_CATEGORY = '__none__';

function TopicDialog({
  topic,
  connected,
  categories,
  open,
  onOpenChange,
}: {
  topic: Topic | null;
  connected: string[];
  categories: Array<{ id: string; name: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const channels = channelsFor(connected, topic);
  const [name, setName] = useState(topic?.name ?? '');
  const [slug, setSlug] = useState(topic?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(topic));
  const [description, setDescription] = useState(topic?.description ?? '');
  const [category, setCategory] = useState(topic?.category ?? '');
  const [dailyCap, setDailyCap] = useState(
    topic?.dailyCap === null || topic?.dailyCap === undefined ? '' : String(topic.dailyCap)
  );
  const [newCategory, setNewCategory] = useState('');
  const [optedIn, setOptedIn] = useState(topic?.defaultOptedIn ?? true);
  const [choices, setChoices] = useState<Record<string, ChannelChoice>>(() => choicesFor(channels, topic));
  const { submit, pending } = useActionFetcher(() => onOpenChange(false));

  const slugValue = slugTouched ? slug : slugify(name);
  const offered = Object.entries(choices).filter(([, choice]) => choice !== 'off');
  const capValid =
    dailyCap.trim() === '' ||
    (/^\d+$/.test(dailyCap.trim()) && Number(dailyCap) >= 1 && Number(dailyCap) <= 50);
  const canSave =
    name.trim().length > 0 && slugValue.length > 0 && offered.length > 0 && capValid && !pending;

  const save = () => {
    const fields: Record<string, string> = {
      name: name.trim(),
      slug: slugValue,
      description: description.trim(),
      category: category === NEW_CATEGORY ? newCategory.trim() : category,
      dailyCap: dailyCap.trim(),
      defaultOptedIn: String(optedIn),
      channels: offered.map(([channel]) => channel).join(','),
    };
    for (const [channel, choice] of offered) fields[`channel:${channel}`] = choice;
    if (topic) fields.topic = topic.slug;
    submit(topic ? 'update' : 'create', fields);
  };

  useEffect(() => {
    if (!open) return;
    setName(topic?.name ?? '');
    setSlug(topic?.slug ?? '');
    setSlugTouched(Boolean(topic));
    setDescription(topic?.description ?? '');
    setCategory(topic?.category ?? '');
    setNewCategory('');
    setDailyCap(topic?.dailyCap === null || topic?.dailyCap === undefined ? '' : String(topic.dailyCap));
    setOptedIn(topic?.defaultOptedIn ?? true);
    setChoices(choicesFor(channelsFor(connected, topic), topic));
  }, [open, topic, connected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{topic ? 'Edit topic' : 'New topic'}</DialogTitle>
        </DialogHeader>
        <FieldGroup className='w-full'>
          <Field>
            <FieldLabel htmlFor='topic-name'>Name</FieldLabel>
            <Input
              id='topic-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder='Running reminders'
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
              maxLength={64}
              autoComplete='off'
              spellCheck={false}
            />
            <FieldDescription>Used by your code when it sends to this topic.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor='topic-description'>Description</FieldLabel>
            <Textarea
              id='topic-description'
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder='A nudge to get your run in'
              maxLength={500}
              rows={2}
            />
            <FieldDescription>
              Shown to subscribers next to the topic in their notification settings.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor='topic-category'>Category</FieldLabel>
            <Select
              items={[
                { value: NO_CATEGORY, label: 'No category' },
                ...categories.map((option) => ({ value: option.name, label: option.name })),
                { value: NEW_CATEGORY, label: 'New category' },
              ]}
              value={category === '' ? NO_CATEGORY : category}
              onValueChange={(value) => setCategory(value === NO_CATEGORY ? '' : (value as string))}
            >
              <SelectTrigger id='topic-category'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                {categories.map((option) => (
                  <SelectItem key={option.id} value={option.name}>
                    {option.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_CATEGORY}>New category</SelectItem>
              </SelectContent>
            </Select>
            {category === NEW_CATEGORY && (
              <Input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder='Events you attend'
                maxLength={100}
                autoFocus
              />
            )}
            <FieldDescription>
              Groups the topic under a heading in notification settings. Topics without a category are listed
              on their own.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor='topic-cap'>Daily cap</FieldLabel>
            <Input
              id='topic-cap'
              value={dailyCap}
              onChange={(event) => setDailyCap(event.target.value)}
              placeholder='No cap'
              inputMode='numeric'
              className='w-24'
              aria-invalid={capValid ? undefined : true}
            />
            <FieldDescription>
              The most messages a subscriber receives from this topic per day, counted in their own timezone.
              Leave empty for no cap.
            </FieldDescription>
          </Field>
          <Field orientation='horizontal'>
            <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
              <FieldLabel htmlFor='topic-default'>Opted in by default</FieldLabel>
              <FieldDescription>New subscribers receive this topic until they opt out.</FieldDescription>
            </span>
            <Switch id='topic-default' checked={optedIn} onCheckedChange={setOptedIn} />
          </Field>
          <Field>
            <span className='flex flex-col gap-0.5'>
              <FieldLabel>Channels</FieldLabel>
              <FieldDescription>Where subscribers can opt in to this topic.</FieldDescription>
            </span>
            <div className='flex flex-col gap-3'>
              {channels.map((channel) => (
                <Field key={channel.id} orientation='horizontal'>
                  <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                    <FieldLabel htmlFor={`topic-channel-${channel.id}`}>{channel.name}</FieldLabel>
                    {!connected.includes(channel.id) && (
                      <FieldDescription>
                        Not connected anymore. Subscribers cannot receive it here.
                      </FieldDescription>
                    )}
                  </span>
                  <Select
                    items={CHOICES}
                    value={choices[channel.id] ?? 'off'}
                    onValueChange={(value) =>
                      setChoices((current) => ({ ...current, [channel.id]: value as ChannelChoice }))
                    }
                  >
                    <SelectTrigger id={`topic-channel-${channel.id}`} className='w-44'>
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
            </div>
          </Field>
          <Button className='w-full' disabled={!canSave} loading={pending} onClick={save}>
            {topic ? 'Save changes' : 'Create topic'}
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}

function groupTopics(topics: Topic[]) {
  const order: Array<string | null> = [];
  const buckets = new Map<string | null, Topic[]>();
  for (const topic of topics) {
    const key = topic.category ?? null;
    if (!buckets.has(key)) {
      order.push(key);
      buckets.set(key, []);
    }
    buckets.get(key)?.push(topic);
  }
  const showsHeaders = order.some((key) => key !== null);
  const sorted = [...order.filter((key) => key !== null), ...(buckets.has(null) ? [null] : [])];
  return sorted.map((key) => ({
    category: key,
    topics: buckets.get(key) ?? [],
    showsHeader: showsHeaders,
  }));
}

function TopicRow({
  topic,
  columns,
  onEdit,
  onDelete,
}: {
  topic: Topic;
  columns: typeof AVAILABLE_CHANNELS;
  onEdit: (topic: Topic) => void;
  onDelete: (topic: Topic) => void;
}) {
  return (
    <TableRow>
      <TableCell className='py-2'>
        <span className='flex min-h-9 min-w-0 flex-col justify-center'>
          <span className='font-medium text-fg-4'>{topic.name}</span>
          {topic.description && <Truncate className='text-fg-2 text-xs'>{topic.description}</Truncate>}
        </span>
      </TableCell>
      <TableCell>{topic.slug}</TableCell>
      {columns.map((channel) => (
        <TableCell key={channel.id}>
          {offers(topic, channel.id) ? (
            <OptInBadge optedIn={resolvedFor(topic, channel.id)} />
          ) : (
            <span className='text-fg-2'>Not offered</span>
          )}
        </TableCell>
      ))}
      <TableCell>
        <Time at={topic.createdAt} />
      </TableCell>
      <TableCell className='w-0 py-1.5 text-right'>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant='ghost'
                size='icon-xs'
                icon='IconDotGrid1x3Horizontal'
                aria-label='Topic actions'
              />
            }
          />
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={() => onEdit(topic)}>Edit</DropdownMenuItem>
            <DropdownMenuItem variant='destructive' onClick={() => onDelete(topic)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export default function TopicsRoute({ loaderData }: Route.ComponentProps) {
  const { connected } = useOutletContext<WorkspaceOutletContext>();
  const { items: topics, pagination, categories } = loaderData;
  const columns = AVAILABLE_CHANNELS.filter((channel) => (connected as string[]).includes(channel.id));
  const [editing, setEditing] = useState<Topic | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Topic | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState<{ id: string; name: string } | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<{ id: string; name: string } | null>(null);
  const { submit, pending } = useActionFetcher(() => setDeleteOpen(false));
  const categoryActions = useActionFetcher(() => {
    setRenamingCategory(null);
    setDeletingCategory(null);
  });

  const openDialog = (topic: Topic | null) => {
    setEditing(topic);
    setOpen(true);
  };
  const openDelete = (topic: Topic) => {
    setDeleting(topic);
    setDeleteOpen(true);
  };
  const onRenameCategory = (name: string) => {
    const match = categories.find((option) => option.name === name);
    if (!match) return;
    setCategoryName(match.name);
    setRenamingCategory(match);
  };
  const onDeleteCategory = (name: string) => {
    const match = categories.find((option) => option.name === name);
    if (match) setDeletingCategory(match);
  };

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Topics
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>Manage notification topics.</p>
        </div>
        <Button icon='IconPlusMedium' onClick={() => openDialog(null)}>
          Create topic
        </Button>
      </header>

      <Card className='min-h-0 shrink'>
        {topics.length === 0 ? (
          <EmptyState
            icon='IconTagFilled'
            title='No topics yet'
            description='Create a topic and subscribers can choose whether they receive it on each channel.'
            className='py-10'
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic</TableHead>
                <TableHead>Slug</TableHead>
                {columns.map((channel) => (
                  <TableHead key={channel.id}>{COLUMN_LABELS[channel.id] ?? channel.name}</TableHead>
                ))}
                <TableHead>Created</TableHead>
                <TableHead>
                  <span className='sr-only'>Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupTopics(topics).map((group) => (
                <Fragment key={group.category ?? 'uncategorized'}>
                  {group.showsHeader && (
                    <TableRow className='hover:bg-transparent'>
                      <TableCell
                        colSpan={columns.length + 3}
                        className='py-1.5 font-medium text-fg-2 text-xs'
                      >
                        {group.category ?? 'No category'}
                      </TableCell>
                      <TableCell className='w-0 py-0.5 text-right'>
                        {group.category !== null && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant='ghost'
                                  size='icon-xs'
                                  icon='IconDotGrid1x3Horizontal'
                                  aria-label='Category actions'
                                />
                              }
                            />
                            <DropdownMenuContent align='end'>
                              <DropdownMenuItem onClick={() => onRenameCategory(group.category as string)}>
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant='destructive'
                                onClick={() => onDeleteCategory(group.category as string)}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                  {group.topics.map((topic) => (
                    <TopicRow
                      key={topic.id}
                      topic={topic}
                      columns={columns}
                      onEdit={openDialog}
                      onDelete={openDelete}
                    />
                  ))}
                </Fragment>
              ))}
            </TableBody>
            <TablePagination {...pagination} />
          </Table>
        )}
      </Card>

      <TopicDialog
        topic={editing}
        connected={connected}
        open={open}
        onOpenChange={setOpen}
        categories={categories}
      />

      <Dialog open={renamingCategory !== null} onOpenChange={(next) => !next && setRenamingCategory(null)}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Rename category</DialogTitle>
          </DialogHeader>
          <FieldGroup className='w-full'>
            <Field>
              <FieldLabel htmlFor='category-name'>Name</FieldLabel>
              <Input
                id='category-name'
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                maxLength={100}
              />
              <FieldDescription>Every topic in the category picks up the new name.</FieldDescription>
            </Field>
            <Button
              className='w-full'
              disabled={categoryName.trim().length === 0 || categoryActions.pending}
              loading={categoryActions.pending}
              onClick={() =>
                renamingCategory &&
                categoryActions.submit('renameCategory', {
                  id: renamingCategory.id,
                  name: categoryName.trim(),
                })
              }
            >
              Rename category
            </Button>
          </FieldGroup>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingCategory !== null}
        onOpenChange={(next) => !next && setDeletingCategory(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deletingCategory?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its topics stay and are listed without a category.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              loading={categoryActions.pending}
              onClick={() =>
                deletingCategory && categoryActions.submit('deleteCategory', { id: deletingCategory.id })
              }
            >
              Delete category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Sends to it stop and subscribers no longer see it.
              <span className='block'>This cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={() => deleting && submit('delete', { topic: deleting.slug })}
            >
              Delete topic
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
