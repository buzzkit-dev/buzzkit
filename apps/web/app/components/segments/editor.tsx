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
import { Card, CardAction, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { toast } from '@buzzkit/ui/components/sonner';
import { Textarea } from '@buzzkit/ui/components/textarea';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { type Expression, formatExpressionPath, lintExpression } from 'buzzkit/expressions';
import { useEffect, useRef, useState } from 'react';
import { Link, useFetcher, useNavigate, useParams } from 'react-router';
import { describeExpression } from '@/app/components/conditions/describe';
import { PageHeader } from '@/app/components/layout/page-header';
import { SendDialog } from '@/app/components/messages/send-dialog';
import { SegmentBuilder } from '@/app/components/segments/builder';
import {
  emptyRow,
  expressionToRows,
  type Match,
  type Row,
  rowProblem,
  rowsToExpression,
  stableKey,
} from '@/app/components/segments/expression';
import { SegmentPreviewPanel } from '@/app/components/segments/preview';
import { describeSlugProblem, slugify } from '@/app/components/workspace/fields';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { useCanManage } from '@/app/hooks/use-known-role';
import type { Segment, SegmentMember, SegmentPreview, Topic } from '@/app/lib/api.server';
import type { Channel } from '@/app/lib/channels';
import { lineOf, parseJson } from '@/app/lib/utils/json';

type Mode = 'builder' | 'json';

const MODES: { value: Mode; label: string }[] = [
  { value: 'builder', label: 'Builder' },
  { value: 'json', label: 'JSON' },
];

const PREVIEW_DELAY_MS = 400;

type JsonIssue = { path: string; message: string; line: number | null };

const pretty = (expression: Expression | null) => (expression ? JSON.stringify(expression, null, 2) : '');

export function SegmentEditor({
  segment,
  preview,
  eventNames,
  topics,
  channels,
  workspaceSlug,
  canManage,
}: {
  segment: Segment | null;
  preview: SegmentPreview | null;
  eventNames: string[];
  topics: Topic[];
  channels: Channel[];
  workspaceSlug: string;
  canManage: boolean;
}) {
  const navigate = useNavigate();
  const previewFetcher = useFetcher<{
    ok?: boolean;
    count?: number;
    sample?: SegmentMember[];
    error?: string;
  }>();
  const { submit, pending } = useActionFetcher((data) => {
    if (typeof data.slug === 'string') {
      toast.success('Segment created');
      void navigate(`/${workspaceSlug}/segments/${data.slug}`);
    } else if (data.deleted) {
      toast.success('Segment deleted');
      void navigate(`/${workspaceSlug}/segments`);
    } else {
      toast.success('Changes saved');
    }
  });
  const base = `/${workspaceSlug}/segments`;
  const saved = segment?.version?.expression ?? null;
  const savedName = segment?.name ?? '';
  const savedDescription = segment?.description ?? '';

  const [name, setName] = useState(savedName);
  const [slug, setSlug] = useState(segment?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(segment !== null);
  const [description, setDescription] = useState(savedDescription);
  const [initialRows] = useState(() =>
    saved ? expressionToRows(saved) : { match: 'all' as Match, rows: [emptyRow()] }
  );
  const [mode, setMode] = useState<Mode>(initialRows ? 'builder' : 'json');
  const [builderBlocked, setBuilderBlocked] = useState(initialRows === null);
  const [match, setMatch] = useState<Match>(initialRows?.match ?? 'all');
  const [rows, setRows] = useState<Row[]>(initialRows?.rows ?? []);
  const [json, setJson] = useState(pretty(saved));
  const [jsonExpression, setJsonExpression] = useState<Expression | null>(saved);
  const [jsonSyntax, setJsonSyntax] = useState<{ message: string; line: number; column: number } | null>(
    null
  );
  const [jsonIssues, setJsonIssues] = useState<JsonIssue[]>([]);
  const [showProblems, setShowProblems] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [latest, setLatest] = useState<{ count: number; sample: SegmentMember[] } | null>(preview);
  const jsonRef = useRef<HTMLTextAreaElement>(null);
  const lastKey = useRef<string | null>(saved ? stableKey(saved) : null);
  const mainRef = useRef<HTMLDivElement>(null);

  const expression = mode === 'builder' ? rowsToExpression(match, rows) : jsonExpression;
  const expressionKey = expression ? stableKey(expression) : null;
  const previewExpression =
    mode === 'builder'
      ? rowsToExpression(
          match,
          rows.filter((row) => rowProblem(row) === null)
        )
      : jsonExpression;
  const previewKey = previewExpression ? stableKey(previewExpression) : null;
  const jsonProblem = jsonSyntax ? jsonSyntax.message : (jsonIssues[0]?.message ?? null);
  const dirty =
    segment === null ||
    name.trim() !== segment.name ||
    description.trim() !== (segment.description ?? '') ||
    expressionKey !== (saved ? stableKey(saved) : null);
  const slugProblem = segment ? null : describeSlugProblem(slug.trim());
  const complete =
    name.trim().length > 0 && slug.trim().length > 0 && slugProblem === null && expression !== null;
  const previewProblem =
    mode === 'json' && jsonProblem
      ? 'Fix the JSON to see who matches.'
      : previewFetcher.data?.error && previewFetcher.state === 'idle' && !previewFetcher.data.ok
        ? previewFetcher.data.error
        : null;

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === 'json') {
      setJson(pretty(expression ?? jsonExpression));
      setJsonExpression(expression ?? jsonExpression);
      setJsonSyntax(null);
      setJsonIssues([]);
    } else {
      const converted = jsonExpression ? expressionToRows(jsonExpression) : null;
      if (converted) {
        setMatch(converted.match);
        setRows(converted.rows);
        setBuilderBlocked(false);
      } else if (!jsonExpression) {
        setRows([emptyRow()]);
        setBuilderBlocked(false);
      } else {
        setBuilderBlocked(true);
      }
    }
    setMode(next);
  };

  const discard = () => {
    setName(savedName);
    setSlug(segment?.slug ?? '');
    setSlugTouched(segment !== null);
    setDescription(savedDescription);
    setMode(initialRows ? 'builder' : 'json');
    setBuilderBlocked(initialRows === null);
    setMatch(initialRows?.match ?? 'all');
    setRows(initialRows?.rows ?? []);
    setJson(pretty(saved));
    setJsonExpression(saved);
    setJsonSyntax(null);
    setJsonIssues([]);
    setShowProblems(false);
  };

  const changeJson = (text: string) => {
    setJson(text);
    if (text.trim().length === 0) {
      setJsonSyntax(null);
      setJsonIssues([]);
      setJsonExpression(null);
      return;
    }
    const parsed = parseJson(text);
    if (!parsed.ok) {
      setJsonSyntax({ message: parsed.message, line: parsed.line, column: parsed.column });
      setJsonIssues([]);
      setJsonExpression(null);
      return;
    }
    const issues = lintExpression(parsed.value).map((issue) => ({
      path: formatExpressionPath(issue.path),
      message: issue.message,
      line: lineOf(parsed.locations, issue.path),
    }));
    setJsonSyntax(null);
    setJsonIssues(issues);
    setJsonExpression(issues.length === 0 ? (parsed.value as Expression) : null);
  };

  const jumpToLine = (line: number | null) => {
    const area = jsonRef.current;
    if (!area || line === null) return;
    const lines = json.split('\n');
    const start = lines.slice(0, line - 1).reduce((total, entry) => total + entry.length + 1, 0);
    const end = start + (lines[line - 1]?.length ?? 0);
    area.focus();
    area.setSelectionRange(start, end);
    const lineHeight = Number.parseFloat(getComputedStyle(area).lineHeight) || 18;
    area.scrollTop = Math.max(0, (line - 3) * lineHeight);
  };

  const save = () => {
    if (!expression) {
      setShowProblems(true);
      return;
    }
    void submit(segment ? 'update' : 'create', {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim(),
      expression: JSON.stringify(expression),
    });
  };

  useEffect(() => {
    if (!previewKey || previewKey === lastKey.current) return;
    const timer = setTimeout(() => {
      lastKey.current = previewKey;
      void previewFetcher.submit(
        { intent: 'preview', expression: JSON.stringify(previewExpression) },
        { method: 'post' }
      );
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [previewKey]);

  useEffect(() => {
    if (previewFetcher.state !== 'idle' || !previewFetcher.data?.ok) return;
    setLatest({ count: previewFetcher.data.count ?? 0, sample: previewFetcher.data.sample ?? [] });
  }, [previewFetcher.state, previewFetcher.data]);

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <Button
        variant='ghost'
        size='sm'
        icon='IconChevronLeftMedium'
        className='-ml-2 w-fit shrink-0 text-fg-2 hover:text-fg-4'
        nativeButton={false}
        render={<Link to={base} />}
      >
        Segments
      </Button>

      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <h1 className='flex min-w-0 items-center gap-2.5 font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            <Truncate>{segment?.name ?? 'New segment'}</Truncate>
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            {segment?.description ??
              (saved
                ? describeExpression(saved).join(' · ')
                : 'Who this segment includes, checked against your subscribers as you go.')}
          </p>
        </div>
        {canManage && (
          <div className='flex shrink-0 items-center gap-2'>
            {dirty && segment && (
              <>
                <Badge variant='amber' icon='IconExclamationTriangleFilled' className='[&>svg]:size-4!'>
                  Unsaved changes
                </Badge>
                <Button variant='soft' disabled={pending} onClick={discard}>
                  Discard
                </Button>
              </>
            )}
            <Button disabled={!dirty || !complete || pending} loading={pending} onClick={save}>
              {segment ? 'Save' : 'Create segment'}
            </Button>
            {segment && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant='soft'
                      size='icon'
                      icon='IconDotGrid1x3Horizontal'
                      aria-label='Segment actions'
                    />
                  }
                />
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem onClick={() => setSendOpen(true)}>Send to segment</DropdownMenuItem>
                  <DropdownMenuItem variant='destructive' onClick={() => setDeleteOpen(true)}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </header>

      <ScrollFade targetRef={mainRef} />
      <div
        ref={mainRef}
        className='-m-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-1 [&>*]:shrink-0'
      >
        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <FieldGroup className='p-4'>
            <Field>
              <FieldLabel htmlFor='segment-name'>Name</FieldLabel>
              <Input
                id='segment-name'
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!slugTouched) setSlug(slugify(event.target.value));
                }}
                placeholder='Active pro users'
                maxLength={100}
                disabled={!canManage}
              />
            </Field>
            <Field data-invalid={slugProblem ? true : undefined}>
              <FieldLabel htmlFor='segment-slug'>Slug</FieldLabel>
              <Input
                id='segment-slug'
                value={slug}
                aria-invalid={slugProblem ? true : undefined}
                aria-describedby={slugProblem ? 'segment-slug-error' : undefined}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(slugify(event.target.value));
                }}
                placeholder='active-pro-users'
                maxLength={48}
                disabled={segment !== null}
                spellCheck={false}
                autoComplete='off'
              />
              {slugProblem ? (
                <FieldError id='segment-slug-error'>{slugProblem}</FieldError>
              ) : (
                <FieldDescription>
                  {segment
                    ? 'Messages target the segment by this slug.'
                    : "How the API refers to it. Can't be changed once created."}
                </FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor='segment-description'>Description</FieldLabel>
              <Input
                id='segment-description'
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder='Paying users who opened the app this month'
                maxLength={500}
                disabled={!canManage}
              />
            </Field>
          </FieldGroup>
        </Card>

        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Conditions</CardTitle>
            <CardAction>
              <PillTabs
                items={MODES}
                value={mode}
                itemClassName='h-6.5 px-2.5 text-xs'
                onValueChange={switchMode}
              />
            </CardAction>
          </CardHeader>
          <div>
            {mode === 'builder' ? (
              !builderBlocked ? (
                <SegmentBuilder
                  match={match}
                  rows={rows}
                  eventNames={eventNames}
                  channels={channels}
                  showProblems={showProblems}
                  onMatchChange={setMatch}
                  onRowsChange={setRows}
                />
              ) : (
                <div className='flex flex-col items-center gap-3 px-4 py-8 text-center'>
                  <p className='max-w-sm text-pretty text-fg-2 text-sm'>
                    This segment nests conditions in a way the builder cannot show. Keep editing it as JSON.
                  </p>
                  <Button variant='soft' size='sm' onClick={() => switchMode('json')}>
                    Edit as JSON
                  </Button>
                </div>
              )
            ) : (
              <div className='flex flex-col gap-2 p-4'>
                <Textarea
                  ref={jsonRef}
                  value={json}
                  onChange={(event) => changeJson(event.target.value)}
                  rows={14}
                  spellCheck={false}
                  aria-label='Expression'
                  aria-invalid={jsonProblem ? true : undefined}
                  className='text-xs'
                  placeholder='{ "all": [{ "ref": "attributes.plan", "eq": "pro" }, { "channel": "push" }] }'
                />
                {jsonSyntax ? (
                  <button
                    type='button'
                    onClick={() => jumpToLine(jsonSyntax.line)}
                    className='flex items-start gap-2 text-left text-red-text text-sm'
                  >
                    <span className='shrink-0 tabular-nums'>
                      Line {jsonSyntax.line}:{jsonSyntax.column}
                    </span>
                    <span>{jsonSyntax.message}</span>
                  </button>
                ) : jsonIssues.length > 0 ? (
                  <div className='flex flex-col gap-1'>
                    {jsonIssues.map((issue) => (
                      <button
                        key={`${issue.path}:${issue.message}`}
                        type='button'
                        onClick={() => jumpToLine(issue.line)}
                        className='flex items-start gap-2 rounded-lg text-left text-sm outline-none hover:text-fg-4 focus-visible:ring-2 focus-visible:ring-primary-2'
                      >
                        <span className='w-16 shrink-0 text-fg-2 tabular-nums'>
                          {issue.line === null ? '' : `Line ${issue.line}`}
                        </span>
                        <span className='text-red-text'>
                          <span className='text-xs'>{issue.path}</span> · {issue.message}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <FieldDescription>
                    The expression as the API stores it. Paste one in, or edit it here when you need groups
                    the builder cannot draw.
                  </FieldDescription>
                )}
              </div>
            )}
          </div>
        </Card>

        <SegmentPreviewPanel
          count={previewExpression ? (latest?.count ?? null) : null}
          sample={previewExpression ? (latest?.sample ?? []) : []}
          pending={previewFetcher.state !== 'idle'}
          problem={previewProblem}
          subscribersBase={`/${workspaceSlug}/subscribers`}
        />
      </div>

      {segment && (
        <SendDialog
          topics={topics}
          segments={[segment]}
          channels={channels}
          messagesBase={`/${workspaceSlug}/messages`}
          initial={{ target: 'segment', segment: segment.slug }}
          open={sendOpen}
          onOpenChange={setSendOpen}
        />
      )}

      {segment && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {segment.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Messages already sent to it keep their record. Workflows that reference it stop matching
                anyone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant='destructive'
                onClick={() => submit('delete', { slug: segment.slug })}
              >
                Delete segment
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export function SegmentEditorSkeleton({
  existing,
  canManage,
}: {
  existing: boolean;
  canManage: boolean | null;
}) {
  const { slug } = useParams();
  const manage = useCanManage(canManage);

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <Button
        variant='ghost'
        size='sm'
        icon='IconChevronLeftMedium'
        className='-ml-2 w-fit shrink-0 text-fg-2 hover:text-fg-4'
        nativeButton={false}
        render={<Link to={`/${slug}/segments`} />}
      >
        Segments
      </Button>

      <PageHeader
        title={existing ? <Skeleton className='h-7 w-56' /> : 'New segment'}
        titleClassName='flex min-w-0 items-center gap-2.5'
        description={
          existing ? (
            <span className='inline-block h-5 w-80 animate-pulse rounded-sm bg-bg-4 align-middle' />
          ) : (
            'Who this segment includes, checked against your subscribers as you go.'
          )
        }
        actions={manage === false ? null : <Button disabled>{existing ? 'Save' : 'Create segment'}</Button>}
      />

      <div className='-m-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-1 [&>*]:shrink-0'>
        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <FieldGroup className='p-4'>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Skeleton className='h-8.5 w-full rounded-xl' />
            </Field>
            <Field>
              <FieldLabel>Slug</FieldLabel>
              <Skeleton className='h-8.5 w-full rounded-xl' />
            </Field>
            <Field>
              <FieldLabel>Description</FieldLabel>
              <Skeleton className='h-8.5 w-full rounded-xl' />
            </Field>
          </FieldGroup>
        </Card>

        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Conditions</CardTitle>
            <CardAction>
              <PillTabs items={MODES} value='builder' itemClassName='h-6.5 px-2.5 text-xs' />
            </CardAction>
          </CardHeader>
          <div className='p-4'>
            <Skeleton className='h-8.5 w-full rounded-xl' />
          </div>
        </Card>
      </div>
    </div>
  );
}
