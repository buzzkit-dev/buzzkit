import { Icon } from '@buzzkit/ui/components/icon';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { describeStreamEvent } from '@/app/components/events/stream';

export function EventName({ name, data = {} }: { name: string; data?: unknown }) {
  const { label, icon } = describeStreamEvent({ name, data });
  return (
    <span className='flex min-w-0 items-center gap-1.5'>
      <Icon name={icon} className='size-4 shrink-0 text-fg-2' />
      <Truncate className='font-medium text-fg-4'>{label}</Truncate>
    </span>
  );
}
