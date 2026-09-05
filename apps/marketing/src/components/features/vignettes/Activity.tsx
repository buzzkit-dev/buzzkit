import { type Notification, NotificationCard } from '@buzzkit/ui/components/notification';

const LIFECYCLE: { state: string; at: string; notification: Notification }[] = [
  {
    state: 'Started',
    at: '12:04',
    notification: {
      id: 'nook-start',
      kind: 'activity',
      app: 'Nook',
      title: 'Out for delivery',
      detail: '6 stops away · 24 min',
      progress: 0.3,
    },
  },
  {
    state: 'Updated',
    at: '12:18',
    notification: {
      id: 'nook-update',
      kind: 'activity',
      app: 'Nook',
      title: 'Almost there',
      detail: '2 stops away · 6 min',
      progress: 0.75,
    },
  },
  {
    state: 'Ended',
    at: '12:31',
    notification: {
      id: 'nook-end',
      kind: 'activity',
      app: 'Nook',
      title: 'Delivered',
      detail: 'Left at the front door',
      progress: 1,
    },
  },
];

export function ActivityVignette() {
  return (
    <div className='flex w-72 flex-col gap-3'>
      {LIFECYCLE.map((step) => (
        <div key={step.notification.id} className='flex flex-col gap-1.5'>
          <span className='flex items-center gap-2 px-1 text-xs'>
            <span className='font-medium text-fg-3'>{step.state}</span>
            <span className='text-fg-1'>{step.at}</span>
          </span>
          <NotificationCard notification={step.notification} />
        </div>
      ))}
    </div>
  );
}
