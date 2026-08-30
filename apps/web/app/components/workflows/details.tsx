import {
  describeDuration,
  FALLBACK_CASE,
  parseTemplate,
  type Step,
  type TemplateOperand,
  type TemplatePart,
} from '@buzzkit/schema/workflows';
import { Badge } from '@buzzkit/ui/components/badge';
import type { IconName } from '@buzzkit/ui/components/icon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { ConditionChips, ConditionSummary } from '@/app/components/conditions/chips';
import { describeMoment, describeTimeout } from '@/app/components/workflows/describe';
import { whereTree } from '@/app/components/workflows/trigger';
import { TIME_TOOLTIP_DELAY } from '@/app/hooks/use-time-ago';

export type StepPayload = Record<string, unknown>;

function Chip({ icon, children }: { icon?: IconName; children: React.ReactNode }) {
  return (
    <Badge size='sm' icon={icon} className='min-w-0 max-w-full shrink whitespace-nowrap'>
      <Truncate className='max-w-full font-medium text-fg-4'>{children}</Truncate>
    </Badge>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <span className='text-fg-2 text-xs'>{children}</span>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <span className='flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1'>{children}</span>;
}

function operandLabel(operand: TemplateOperand): string {
  return operand.kind === 'path' ? (operand.path.split('.').pop() ?? operand.path) : String(operand.value);
}

function placeholderLabel(part: Extract<TemplatePart, { kind: 'placeholder' }>): string {
  const { placeholder } = part;
  if (placeholder.test && placeholder.otherwise) {
    return `${operandLabel(placeholder.value)} or ${operandLabel(placeholder.otherwise)}`;
  }
  return operandLabel(placeholder.value);
}

function safeParse(text: string): TemplatePart[] {
  try {
    return parseTemplate(text);
  } catch {
    return [{ kind: 'text', text }];
  }
}

function Hover({
  text,
  children,
  className,
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TooltipProvider delay={TIME_TOOLTIP_DELAY}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                'cursor-default underline decoration-bg-4 decoration-dotted underline-offset-2',
                className
              )}
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipContent className='max-w-md whitespace-pre-wrap font-normal'>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function TemplateText({
  text,
  rendered,
  className,
}: {
  text: string;
  rendered?: string | null;
  className?: string;
}) {
  const parts = safeParse(text);
  if (!parts.some((part) => part.kind === 'placeholder')) {
    return <span className={cn('break-words', className)}>{text}</span>;
  }
  if (typeof rendered === 'string') {
    return (
      <Hover text={text} className={cn('break-words', className)}>
        {rendered}
      </Hover>
    );
  }
  let offset = 0;
  const keyed = parts.map((part) => {
    const key = `${offset}`;
    offset += part.kind === 'text' ? part.text.length : part.placeholder.source.length + 4;
    return { part, key };
  });
  return (
    <span className={cn('break-words', className)}>
      {keyed.map(({ part, key }) =>
        part.kind === 'text' ? (
          <span key={key}>{part.text}</span>
        ) : (
          <Hover key={key} text={`{{${part.placeholder.source}}}`} className='font-medium text-fg-4'>
            {placeholderLabel(part)}
          </Hover>
        )
      )}
    </span>
  );
}

function urlLabel(url: string): string {
  const bare = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return safeParse(bare)
    .map((part) => (part.kind === 'text' ? part.text : `{${placeholderLabel(part)}}`))
    .join('');
}

function renderedText(payload: StepPayload | undefined, key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' ? value : null;
}

type Rule = { key: string; label: string; value: React.ReactNode };

function stepRules(step: Step): Rule[] {
  if ('waitFor' in step) {
    const { settleFor, resetOn, timeout } = step.waitFor;
    return [
      ...(settleFor ? [{ key: 'quiet', label: 'Quiet for', value: describeDuration(settleFor) }] : []),
      ...(resetOn && resetOn.length > 0
        ? [
            {
              key: 'reset',
              label: 'Reset by',
              value: (
                <Row>
                  {resetOn.map((name) => (
                    <Chip key={name} icon='IconZapFilled'>
                      {name}
                    </Chip>
                  ))}
                </Row>
              ),
            },
          ]
        : []),
      { key: 'timeout', label: 'Give up', value: describeTimeout(timeout).replace(/^for up to /, 'after ') },
    ];
  }
  if ('fetch' in step) {
    const { as, expect, onError } = step.fetch;
    return [
      ...(as ? [{ key: 'as', label: 'Saved as', value: as }] : []),
      ...(expect ? [{ key: 'expect', label: 'Expects', value: expect.status.join(', ') }] : []),
      ...(onError && onError !== 'fail'
        ? [{ key: 'error', label: 'On error', value: onError === 'skip' ? 'skip the step' : 'continue' }]
        : []),
    ];
  }
  if ('send' in step) {
    const { topic, channel, skipIfSentWithin } = step.send;
    return [
      ...(topic ? [{ key: 'topic', label: 'Topic', value: topic }] : []),
      ...(channel ? [{ key: 'channel', label: 'Channel', value: channel }] : []),
      ...(skipIfSentWithin
        ? [{ key: 'skip', label: 'Skip if sent within', value: describeDuration(skipIfSentWithin) }]
        : []),
    ];
  }
  return [];
}

export function StepRules({ step }: { step: Step }) {
  const rules = stepRules(step);
  if (rules.length === 0) return null;
  return (
    <dl className='flex flex-col gap-1 border-bg-3 border-t bg-bg-2/60 px-2.5 py-1.5 text-xs'>
      {rules.map((rule) => (
        <div key={rule.key} className='flex min-w-0 items-center justify-between gap-3'>
          <dt className='shrink-0 text-fg-2'>{rule.label}</dt>
          <dd className='min-w-0 text-right text-fg-4'>{rule.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StepDetails({ step, payload }: { step: Step; payload?: StepPayload }) {
  if ('exit' in step) return null;
  if ('wait' in step) return <Note>Wait {describeDuration(step.wait)}</Note>;
  if ('waitUntil' in step) return <Note>Wait until {describeMoment(step.waitUntil)}</Note>;
  if ('waitFor' in step) {
    const { event, where } = step.waitFor;
    const tree = where ? whereTree(where) : null;
    return (
      <span className='flex min-w-0 flex-col gap-1'>
        <Row>
          <Note>Wait for</Note>
          <Chip icon='IconZapFilled'>{event}</Chip>
        </Row>
        {tree && (
          <Row>
            <Note>where</Note>
            <ConditionChips tree={tree} limit={2} wrap />
          </Row>
        )}
      </span>
    );
  }
  if ('branch' in step) {
    const cases = Array.isArray(step.branch) ? step.branch : [];
    const fallback = cases.some((entry) => entry.when === undefined);
    return (
      <Note>
        {cases.map((entry, index) => {
          const tree = entry.when ? whereTree(entry.when) : null;
          return (
            <span key={entry.name}>
              {index > 0 && ' · '}
              <TooltipProvider delay={TIME_TOOLTIP_DELAY}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className='cursor-default text-fg-4 underline decoration-bg-4 decoration-dotted underline-offset-2' />
                    }
                  >
                    {entry.name}
                  </TooltipTrigger>
                  <TooltipContent className='max-w-md p-2'>
                    {tree ? <ConditionSummary tree={tree} /> : 'When no case above matches'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          );
        })}
        {!fallback && ` · ${FALLBACK_CASE}`}
      </Note>
    );
  }
  if ('fetch' in step) {
    const { method, url, body } = step.fetch;
    return (
      <span className='flex min-w-0 items-center gap-1.5'>
        <Note>{method ?? (body === undefined ? 'GET' : 'POST')}</Note>
        <Chip>{renderedText(payload, 'url')?.replace(/^https?:\/\//, '') ?? urlLabel(url)}</Chip>
      </span>
    );
  }
  if ('set' in step) {
    const target = 'attribute' in step.set ? `attribute ${step.set.attribute}` : `variable ${step.set.var}`;
    const value = step.set.value;
    return (
      <Note>
        Set {target} to{' '}
        {typeof value === 'string' ? (
          <TemplateText text={value} rendered={renderedText(payload, 'value')} />
        ) : (
          JSON.stringify(value)
        )}
      </Note>
    );
  }
  const { title, body } = step.send;
  return (
    <span className='flex min-w-0 flex-col gap-0.5'>
      {title && (
        <TemplateText text={title} rendered={renderedText(payload, 'title')} className='text-fg-4 text-xs' />
      )}
      {body && (
        <TemplateText text={body} rendered={renderedText(payload, 'body')} className='text-fg-2 text-xs' />
      )}
    </span>
  );
}
