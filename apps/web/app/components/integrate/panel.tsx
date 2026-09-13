import { Button } from '@buzzkit/ui/components/button';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { Field, FieldDescription, FieldLabel } from '@buzzkit/ui/components/field';
import { TextSwap } from '@buzzkit/ui/components/text-swap';
import { useEffect, useRef, useState } from 'react';

const SKILL_URL = 'https://buzzkit.dev/skill.md';

const HOSTED_API_URL = 'https://api.buzzkit.dev';

export function agentPrompt({ apiUrl, clientKey }: { apiUrl: string; clientKey: string | null }) {
  const key = clientKey ?? 'the client key on the API keys page of the dashboard';
  const origin = apiUrl === HOSTED_API_URL ? '' : ` The API is at ${apiUrl}.`;
  return `Add BuzzKit notifications to this project. Install the skill from ${SKILL_URL} and follow it. The client key is ${key}.${origin}`;
}

function CopyPromptButton({ prompt }: { prompt: string }) {
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
    <Button className='w-full' icon={copied ? 'IconCheckmark1' : 'IconClipboard2'} onClick={copy}>
      <TextSwap>{copied ? 'Copied' : 'Copy agent prompt'}</TextSwap>
    </Button>
  );
}

export function IntegratePanel({ apiUrl, clientKey }: { apiUrl: string; clientKey: string | null }) {
  return (
    <div className='flex w-full flex-col gap-4'>
      <Field>
        <FieldLabel>Agent prompt</FieldLabel>
        <CopyPromptButton prompt={agentPrompt({ apiUrl, clientKey })} />
        <FieldDescription>
          Paste it into your coding agent. It installs the skill, adds the SDK to your app and wires up your
          backend.
        </FieldDescription>
      </Field>
      {clientKey && (
        <Field>
          <FieldLabel>Client key</FieldLabel>
          <CodeBlock code={clientKey} className='w-full' />
          <FieldDescription>
            Ships inside your app and reaches the client API only. Keys for your backend are created under{' '}
            <span className='text-fg-4'>API keys</span>.
          </FieldDescription>
        </Field>
      )}
    </div>
  );
}
