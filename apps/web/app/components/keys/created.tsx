import { Button } from '@buzzkit/ui/components/button';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@buzzkit/ui/components/dialog';
import { Field, FieldLabel } from '@buzzkit/ui/components/field';
import type { BuzzKit } from 'buzzkit';
import { useState } from 'react';

export type CreatedKey = { secret: string; kind: BuzzKit.KeyKind };

function firstUseSnippet(apiUrl: string, kind: BuzzKit.KeyKind, secret: string) {
  if (kind === 'client') {
    return [
      `curl -X POST ${apiUrl}/v1/client/identify \\`,
      `  -H 'Authorization: Bearer ${secret}' \\`,
      "  -H 'Content-Type: application/json' \\",
      `  -d '{ "externalId": "user_42" }'`,
    ].join('\n');
  }
  return [
    `curl -X PUT ${apiUrl}/v1/subscribers/user_42 \\`,
    `  -H 'Authorization: Bearer ${secret}' \\`,
    "  -H 'Content-Type: application/json' \\",
    `  -d '{ "email": "jane@acme.com" }'`,
  ].join('\n');
}

export function CreatedKeyView({
  created,
  apiUrl,
  copied,
  onCopy,
  onDone,
}: {
  created: CreatedKey;
  apiUrl: string;
  copied: boolean;
  onCopy: () => void;
  onDone: () => void;
}) {
  const captureManualCopy = () => {
    if (document.getSelection()?.toString().includes(created.secret)) onCopy();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Copy your key</DialogTitle>
        <DialogDescription>This is the only time the key is shown.</DialogDescription>
      </DialogHeader>
      <div className='flex w-full flex-col gap-3' onCopy={captureManualCopy}>
        <CodeBlock code={created.secret} className='w-full' onCopy={onCopy} />
        <Field>
          <FieldLabel>Use it right away</FieldLabel>
          <CodeBlock
            code={firstUseSnippet(apiUrl, created.kind, created.secret)}
            className='w-full'
            onCopy={onCopy}
          />
        </Field>
        <Button className='w-full' disabled={!copied} onClick={onDone}>
          Done
        </Button>
      </div>
    </>
  );
}

export function CreatedKeyDialog({
  created,
  apiUrl,
  onDone,
}: {
  created: CreatedKey | null;
  apiUrl: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const locked = created !== null && !copied;

  const close = () => {
    setCopied(false);
    onDone();
  };

  return (
    <Dialog
      open={created !== null}
      onOpenChange={(next) => {
        if (!next && !locked) close();
      }}
      disablePointerDismissal={locked}
    >
      <DialogContent showCloseButton={false}>
        {created && (
          <CreatedKeyView
            created={created}
            apiUrl={apiUrl}
            copied={copied}
            onCopy={() => setCopied(true)}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
