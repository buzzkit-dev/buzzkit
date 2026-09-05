import { NotificationCard } from '@buzzkit/ui/components/notification';
import { Snippet } from '../../ui/Snippet';

export function SendVignette({ html }: { html: string }) {
  return (
    <div className='flex flex-col items-center gap-5 md:flex-row md:items-center md:gap-8'>
      <Snippet html={html} className='w-full max-w-md' card />
      <NotificationCard
        notification={{
          id: 'gymly',
          kind: 'banner',
          app: 'Gymly',
          title: 'Leg day',
          body: 'Let’s go. 6:00 with Maya.',
          when: 'now',
        }}
      />
    </div>
  );
}
