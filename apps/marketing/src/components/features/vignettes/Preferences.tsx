import { Switch } from '@buzzkit/ui/components/switch';
import { useState } from 'react';

const TOPICS = [
  { label: 'Workout reminders', description: 'Your booked classes and sessions', on: true },
  { label: 'Progress updates', description: 'Weekly recaps and streaks', on: true },
  { label: 'Tips and offers', description: 'New classes and member deals', on: false },
];

export function PreferencesVignette() {
  const [state, setState] = useState(TOPICS.map((topic) => topic.on));
  return (
    <div className='w-72 rounded-3xl bg-bg-1 p-2 shadow-2 ring-1 ring-bg-3 corner-superellipse/1.125'>
      <div className='mx-auto mt-1 mb-3 h-1.5 w-14 rounded-full bg-bg-4' />
      <div className='px-3 pb-2 font-medium text-fg-4'>Notifications</div>
      <div className='flex flex-col rounded-2xl bg-bg-2 px-3'>
        {TOPICS.map((topic, index) => (
          <div
            key={topic.label}
            className='flex items-center gap-3 border-bg-3 border-b py-3 last:border-b-0'
          >
            <span className='flex min-w-0 flex-1 flex-col'>
              <span className='font-medium text-fg-4 text-sm'>{topic.label}</span>
              <span className='truncate text-fg-2 text-xs'>{topic.description}</span>
            </span>
            <Switch
              aria-label={topic.label}
              checked={state[index]}
              onCheckedChange={(checked) =>
                setState((current) =>
                  current.map((value, position) => (position === index ? checked : value))
                )
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
