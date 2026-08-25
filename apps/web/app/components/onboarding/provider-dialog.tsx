import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@buzzkit/ui/components/dialog';
import { useState } from 'react';
import type { AvailableProvider, ChannelEntry } from '@/app/components/onboarding/catalog';
import { connectedSlots } from '@/app/components/onboarding/connected';
import { GUIDES } from '@/app/components/onboarding/guides';
import { GuideCardBody } from '@/app/components/onboarding/layout';
import { useProviderGuide } from '@/app/components/onboarding/provider-guide';
import type { Credential } from '@/app/lib/api.server';

function Title({ children }: { children: React.ReactNode }) {
  return (
    <DialogTitle className='flex w-full items-center gap-1 text-left font-medium text-base text-fg-4 leading-tighter'>
      {children}
    </DialogTitle>
  );
}

function Description({ children }: { children: React.ReactNode }) {
  return (
    <DialogDescription className='w-full text-pretty text-left text-fg-2 text-sm'>
      {children}
    </DialogDescription>
  );
}

export function ProviderDialog({
  workspaceSlug,
  channel,
  provider,
  credentials,
  open,
  onOpenChange,
  action,
}: {
  workspaceSlug: string;
  channel: ChannelEntry;
  provider: AvailableProvider;
  credentials: Credential[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: string;
}) {
  const existing = credentials.find((credential) => credential.provider === provider.id) ?? null;
  const guide = useProviderGuide({
    guide: GUIDES[provider.id],
    providerId: provider.id,
    existing,
    back: () => onOpenChange(false),
    initialStep: 0,
    storageKey: `buzzkit:connect:${workspaceSlug}:${provider.id}`,
    action,
    trackStep: false,
  });

  const connected = guide.connected
    ? guide.connected.map(
        (created) => credentials.find((credential) => credential.id === created.id) ?? created
      )
    : null;
  const position = connected ? 900 : guide.current;
  const transitionKey = `${provider.id}:${connected ? 'connected' : guide.current}`;
  const [nav, setNav] = useState({ key: transitionKey, position, direction: 1 });
  if (nav.key !== transitionKey) {
    setNav({ key: transitionKey, position, direction: position >= nav.position ? 1 : -1 });
  }

  const slots = connected
    ? connectedSlots({
        credentials: connected,
        provider,
        channel,
        fetcher: guide.fetcher,
        action,
        done: { label: 'Done', onClick: () => onOpenChange(false) },
      })
    : guide.slots;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent showCloseButton className='items-stretch gap-0 p-0 sm:max-w-md'>
        {slots && (
          <GuideCardBody
            transitionKey={transitionKey}
            motion={{ direction: nav.direction, from: 'preview', to: 'preview' }}
            slots={slots}
            Title={Title}
            Description={Description}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
