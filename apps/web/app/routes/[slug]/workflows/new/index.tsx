import { Button } from '@buzzkit/ui/components/button';
import { Card, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { toast } from '@buzzkit/ui/components/sonner';
import { Textarea } from '@buzzkit/ui/components/textarea';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { WorkflowFlow } from '@/app/components/workflows/flow';
import { parseSpec, SpecEditor } from '@/app/components/workflows/spec-editor';
import { describeSlugProblem, slugify } from '@/app/components/workspace/fields';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { workflowsAction } from '@/app/lib/actions/workflows.server';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'New workflow · BuzzKit' }];
}

export const action = workflowsAction;

export default function NewWorkflowRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate();
  const base = `/${params.slug}/workflows`;
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [text, setText] = useState('');
  const mainRef = useRef<HTMLDivElement>(null);
  const { submit, pending } = useActionFetcher((data) => {
    if (typeof data.slug !== 'string') return;
    toast.success('Workflow created');
    navigate(`${base}/${data.slug}`);
  });

  const slugValue = slugTouched ? slug : slugify(name);
  const slugProblem = slugValue ? describeSlugProblem(slugValue) : null;
  const result = parseSpec(text);
  const canCreate =
    name.trim().length > 0 && slugValue.length > 0 && !slugProblem && result.spec !== null && !pending;

  const create = () => {
    if (!result.spec) return;
    submit('create', {
      name: name.trim(),
      slug: slugValue,
      description: description.trim(),
      spec: JSON.stringify(result.spec),
    });
  };

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
        Workflows
      </Button>

      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            New workflow
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Send a sequence of messages that starts on an event and follows what the subscriber does next.
          </p>
        </div>
        <Button disabled={!canCreate} loading={pending} onClick={create}>
          Create workflow
        </Button>
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
              <FieldLabel htmlFor='workflow-name'>Name</FieldLabel>
              <Input
                id='workflow-name'
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder='Trial follow-up'
                maxLength={100}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='workflow-slug'>Slug</FieldLabel>
              <Input
                id='workflow-slug'
                value={slugValue}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                placeholder='trial-follow-up'
                maxLength={64}
                autoComplete='off'
                spellCheck={false}
                aria-invalid={slugProblem ? true : undefined}
              />
              {slugProblem ? (
                <FieldError>{slugProblem}</FieldError>
              ) : (
                <FieldDescription>Names the workflow in the API and on its runs.</FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor='workflow-description'>Description</FieldLabel>
              <Textarea
                id='workflow-description'
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder='Nudges trial users who have not upgraded.'
                maxLength={500}
                rows={3}
              />
            </Field>
          </FieldGroup>
        </Card>

        <div className='grid gap-5 lg:grid-cols-2 lg:items-start'>
          <Card className='min-w-0'>
            <CardHeader divider className='py-3'>
              <CardTitle>Definition</CardTitle>
            </CardHeader>
            <div className='p-4'>
              <SpecEditor text={text} result={result} onChange={setText} rows={22} />
            </div>
          </Card>

          <Card className='min-w-0'>
            <CardHeader className='py-3'>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            {result.spec ? (
              <WorkflowFlow spec={result.spec} />
            ) : (
              <EmptyState
                size='sm'
                icon='IconAgentsFilled'
                title={text.trim() ? 'Fix the definition to see the steps' : 'Nothing to preview yet'}
                description='The trigger and the steps appear here as you write them.'
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
