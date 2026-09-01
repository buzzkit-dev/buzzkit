import { SOURCE_PRESETS } from '@buzzkit/schema/sources';
import { Icon } from '@buzzkit/ui/components/icon';
import { cn } from '@buzzkit/ui/lib/utils';
import { useState } from 'react';

const PUBLIC_CLIENT_ID = '1dxbfHSJFAPEGdCLU4o5B';

function logoUrl(domain: string): string {
  return `https://cdn.brandfetch.io/${domain}/w/64/h/64/icon.png?c=${PUBLIC_CLIENT_ID}`;
}

export function ProviderLogo({ provider, className }: { provider: string; className?: string }) {
  const preset = SOURCE_PRESETS[provider as keyof typeof SOURCE_PRESETS];
  const [failed, setFailed] = useState(false);
  const domain = preset?.domain;

  if (!domain || failed) {
    return (
      <span
        className={cn(
          'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-bg-a1 text-fg-2',
          className
        )}
      >
        <Icon name='IconMailboxFilled' className='size-2.5' />
      </span>
    );
  }
  return (
    <img
      src={logoUrl(domain)}
      alt={preset.label}
      width={16}
      height={16}
      onError={() => setFailed(true)}
      className={cn('size-4 shrink-0 rounded-[5px] bg-bg-a1 object-cover', className)}
    />
  );
}
