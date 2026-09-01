import {
  formatWorkflowPath,
  isWorkflowSpec,
  lintWorkflow,
  type WorkflowSpec,
} from '@buzzkit/schema/workflows';
import { FieldDescription } from '@buzzkit/ui/components/field';
import { Textarea } from '@buzzkit/ui/components/textarea';
import { cn } from '@buzzkit/ui/lib/utils';
import { useRef } from 'react';
import { lineOf, parseJson } from '@/app/lib/utils/json';

type SpecIssue = { path: string; message: string; line: number | null };

export type SpecResult = {
  spec: WorkflowSpec | null;
  syntax: { message: string; line: number; column: number } | null;
  issues: SpecIssue[];
};

const SPEC_PLACEHOLDER = JSON.stringify(
  {
    trigger: { event: 'trial.started' },
    steps: [
      { name: 'settle', wait: '2h' },
      { name: 'hello', send: { title: 'Welcome aboard' } },
    ],
  },
  null,
  2
);

const KEY_ORDER = [
  'trigger',
  'event',
  'schedule',
  'daily',
  'cron',
  'timezone',
  'segment',
  'sources',
  'where',
  'ref',
  'concurrency',
  'cancelOn',
  'defaultTimezone',
  'steps',
  'name',
  'wait',
  'waitUntil',
  'waitFor',
  'settleFor',
  'resetOn',
  'timeout',
  'delay',
  'time',
  'branch',
  'when',
  'fetch',
  'method',
  'url',
  'headers',
  'body',
  'expect',
  'status',
  'as',
  'onError',
  'set',
  'attribute',
  'var',
  'value',
  'send',
  'channel',
  'topic',
  'title',
  'subtitle',
  'data',
  'deliver',
  'skipIfSentWithin',
  'exit',
];

function rank(key: string): number {
  const index = KEY_ORDER.indexOf(key);
  return index === -1 ? KEY_ORDER.length : index;
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => rank(a) - rank(b));
  return Object.fromEntries(entries.map(([key, entry]) => [key, key === 'data' ? entry : ordered(entry)]));
}

export function prettySpec(spec: unknown): string {
  return JSON.stringify(ordered(spec), null, 2);
}

export function parseSpec(text: string): SpecResult {
  if (text.trim().length === 0) return { spec: null, syntax: null, issues: [] };
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return {
      spec: null,
      syntax: { message: parsed.message, line: parsed.line, column: parsed.column },
      issues: [],
    };
  }
  const issues = lintWorkflow(parsed.value).map((issue) => ({
    path: formatWorkflowPath(issue.path),
    message: issue.message,
    line: lineOf(parsed.locations, issue.path),
  }));
  const spec = issues.length === 0 && isWorkflowSpec(parsed.value) ? parsed.value : null;
  return { spec, syntax: null, issues };
}

export function SpecEditor({
  text,
  result,
  onChange,
  disabled,
  rows = 18,
  fill = false,
}: {
  text: string;
  result: SpecResult;
  onChange: (text: string) => void;
  disabled?: boolean;
  rows?: number;
  fill?: boolean;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const problem = result.syntax ? result.syntax.message : (result.issues[0]?.message ?? null);

  const jumpToLine = (line: number | null) => {
    const area = areaRef.current;
    if (!area || line === null) return;
    const lines = text.split('\n');
    const start = lines.slice(0, line - 1).reduce((total, entry) => total + entry.length + 1, 0);
    const end = start + (lines[line - 1]?.length ?? 0);
    area.focus();
    area.setSelectionRange(start, end);
    const lineHeight = Number.parseFloat(getComputedStyle(area).lineHeight) || 18;
    area.scrollTop = Math.max(0, (line - 3) * lineHeight);
  };

  return (
    <div className={cn('flex flex-col gap-2', fill && 'min-h-0 shrink')}>
      <Textarea
        ref={areaRef}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        rows={fill ? undefined : rows}
        spellCheck={false}
        disabled={disabled}
        aria-label='Workflow definition'
        aria-invalid={problem ? true : undefined}
        className={cn('text-xs', fill && 'h-[32rem] min-h-0 shrink resize-none')}
        placeholder={SPEC_PLACEHOLDER}
      />
      {result.syntax ? (
        <button
          type='button'
          onClick={() => jumpToLine(result.syntax?.line ?? null)}
          className='flex items-start gap-2 text-left text-red-text text-sm'
        >
          <span className='shrink-0 tabular-nums'>
            Line {result.syntax.line}:{result.syntax.column}
          </span>
          <span>{result.syntax.message}</span>
        </button>
      ) : result.issues.length > 0 ? (
        <div className='flex flex-col gap-1'>
          {result.issues.map((issue) => (
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
          The workflow as the API stores it: the trigger that starts a run and the steps it goes through.
        </FieldDescription>
      )}
    </div>
  );
}
