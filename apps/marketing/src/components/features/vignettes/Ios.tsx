import { NotificationCard } from '@buzzkit/ui/components/notification';
import { Snippet } from '../../ui/Snippet';

export function IosVignette({ html }: { html: string }) {
  return (
    <div className='flex flex-col items-center gap-5 md:flex-row md:items-center md:gap-8'>
      <Snippet html={html} className='w-full max-w-md' card />
      <NotificationCard
        notification={{
          id: 'gymly-actions',
          kind: 'actions',
          app: 'Gymly',
          title: 'Rest day is over',
          body: 'Your next workout is ready.',
          actions: ['Snooze', 'Start workout'],
        }}
      />
    </div>
  );
}
