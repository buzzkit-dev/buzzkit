import { PastelAvatar } from '@buzzkit/ui/components/pastel-avatar';

export type Notification =
  | { id: string; kind: 'banner'; app: string; title: string; body: string; when: string }
  | { id: string; kind: 'actions'; app: string; title: string; body: string; actions: [string, string] }
  | { id: string; kind: 'activity'; app: string; title: string; detail: string; progress: number };

export const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    id: 'gymly',
    kind: 'banner',
    app: 'Gymly',
    title: 'Leg day',
    body: 'Let’s go. 6:00 with Maya.',
    when: 'now',
  },
  {
    id: 'nook',
    kind: 'banner',
    app: 'Nook',
    title: 'Your order shipped',
    body: 'Arrives Thursday by 6 pm.',
    when: '2m ago',
  },
  {
    id: 'ledger',
    kind: 'banner',
    app: 'Ledger',
    title: 'Invoice paid',
    body: 'Acme Studio paid $1,240.00.',
    when: '9m ago',
  },
  {
    id: 'trail',
    kind: 'banner',
    app: 'Trail',
    title: 'Storm near your route',
    body: 'Heavy rain expected after 3 pm.',
    when: 'now',
  },
  {
    id: 'readwise',
    kind: 'banner',
    app: 'Dune',
    title: '3 highlights to review',
    body: 'Keep your streak at 41 days.',
    when: '1h ago',
  },
  {
    id: 'pace',
    kind: 'activity',
    app: 'Pace',
    title: 'DL 214 boarding',
    detail: 'Gate B12 · departs 18:40',
    progress: 0.72,
  },
  {
    id: 'gymly-actions',
    kind: 'actions',
    app: 'Gymly',
    title: 'Rest day is over',
    body: 'Your next workout is ready.',
    actions: ['Snooze', 'Start workout'],
  },
  {
    id: 'harbor',
    kind: 'banner',
    app: 'Harbor',
    title: 'Table ready',
    body: 'Head to the host stand.',
    when: 'now',
  },
  {
    id: 'nook-activity',
    kind: 'activity',
    app: 'Nook',
    title: 'Out for delivery',
    detail: '4 stops away',
    progress: 0.85,
  },
];

export function NotificationCard({ notification }: { notification: Notification }) {
  if (notification.kind === 'activity') {
    return (
      <div className='selection-inverse flex w-72 flex-col gap-3 rounded-[22px] bg-fg-4 p-3.5 text-background shadow-3'>
        <div className='flex items-center gap-3'>
          <PastelAvatar
            seed={notification.app}
            size={36}
            className='corner-superellipse/1.125 rounded-[10px]'
          />
          <span className='flex min-w-0 flex-col'>
            <span className='truncate font-medium text-sm'>{notification.title}</span>
            <span className='truncate text-background/60 text-xs'>{notification.detail}</span>
          </span>
          <span className='ml-auto text-background/60 text-xs'>{notification.app}</span>
        </div>
        <div className='h-1.5 w-full overflow-hidden rounded-full bg-background/15'>
          <div
            className='h-full rounded-full bg-background/90'
            style={{ width: `${notification.progress * 100}%` }}
          />
        </div>
      </div>
    );
  }
  return (
    <div className='flex w-72 flex-col gap-2.5 rounded-[22px] bg-bg-1 p-3 shadow-3'>
      <div className='flex items-start gap-3'>
        <PastelAvatar
          seed={notification.app}
          size={38}
          className='corner-superellipse/1.125 rounded-[11px]'
        />
        <span className='flex min-w-0 flex-1 flex-col gap-px'>
          <span className='flex items-baseline justify-between gap-2'>
            <span className='truncate font-medium text-fg-4 text-sm'>{notification.title}</span>
            {notification.kind === 'banner' && (
              <span className='shrink-0 text-fg-1 text-xs'>{notification.when}</span>
            )}
          </span>
          <span className='truncate text-fg-2 text-sm'>{notification.body}</span>
        </span>
      </div>
      {notification.kind === 'actions' && (
        <div className='flex gap-2'>
          {notification.actions.map((action) => (
            <span
              key={action}
              className='flex h-7 flex-1 items-center justify-center rounded-[10px] bg-bg-2 font-medium text-fg-3 text-xs'
            >
              {action}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
