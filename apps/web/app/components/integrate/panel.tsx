import { Button } from '@buzzkit/ui/components/button';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { Field, FieldDescription, FieldLabel } from '@buzzkit/ui/components/field';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { TextSwap } from '@buzzkit/ui/components/text-swap';
import { cn } from '@buzzkit/ui/lib/utils';
import { useEffect, useRef, useState } from 'react';

const SKILL_URL = 'https://buzzkit.dev/skill.md';

const HOSTED_API_URL = 'https://api.buzzkit.dev';

const CLIENT_KEY_PLACEHOLDER = 'bk_pk_'.padEnd(46, '0');

export function agentPrompt({ apiUrl, clientKey }: { apiUrl: string; clientKey: string | null }) {
  const key = clientKey ?? 'the client key on the API keys page of the dashboard';
  const origin = apiUrl === HOSTED_API_URL ? '' : ` The API is at ${apiUrl}.`;
  return `Add BuzzKit notifications to this project. Install the skill from ${SKILL_URL} and follow it. The client key is ${key}.${origin}`;
}

function CopyPromptButton({ prompt, fit, disabled }: { prompt: string; fit: boolean; disabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = () => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Fitted fit={fit}>
      <Button
        className={fit ? undefined : 'w-full'}
        icon={copied ? 'IconCheckmark1' : 'IconClipboard2'}
        disabled={disabled}
        onClick={copy}
      >
        <TextSwap>{copied ? 'Copied' : 'Copy agent prompt'}</TextSwap>
      </Button>
    </Fitted>
  );
}

function Fitted({ fit, children }: { fit: boolean; children: React.ReactNode }) {
  if (!fit) return children;
  return <div className='flex max-w-full'>{children}</div>;
}

export function IntegratePanel({
  apiUrl,
  clientKey,
  fit = false,
  loading = false,
}: {
  apiUrl: string;
  clientKey: string | null;
  fit?: boolean;
  loading?: boolean;
}) {
  const showKey = loading || clientKey !== null;

  return (
    <div className='flex w-full flex-col gap-4'>
      <Field>
        <FieldLabel>Agent prompt</FieldLabel>
        <CopyPromptButton prompt={agentPrompt({ apiUrl, clientKey })} fit={fit} disabled={loading} />
        <FieldDescription>
          Paste it into your coding agent. It installs the skill, adds the SDK to your app and wires up your
          backend.
        </FieldDescription>
      </Field>
      {showKey && (
        <Field>
          <FieldLabel>Client key</FieldLabel>
          <Fitted fit={fit}>
            {clientKey ? (
              <CodeBlock code={clientKey} className={fit ? 'w-auto max-w-full' : 'w-full'} />
            ) : (
              <Skeleton
                className={cn('corner-superellipse/1.125 rounded-xl', fit ? 'w-auto max-w-full' : 'w-full')}
              >
                <pre className='invisible w-max min-w-full px-3 py-2 pr-11 text-xs leading-relaxed'>
                  <code>{CLIENT_KEY_PLACEHOLDER}</code>
                </pre>
              </Skeleton>
            )}
          </Fitted>
          <FieldDescription>Ships inside your app and reaches the client API only.</FieldDescription>
        </Field>
      )}
    </div>
  );
}
