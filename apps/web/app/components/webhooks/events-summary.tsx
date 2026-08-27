import { Tooltip, TooltipContent, TooltipTrigger } from '@buzzkit/ui/components/tooltip';

export function EventsSummary({ events }: { events: string[] }) {
  if (events.length === 0 || events.includes('*')) return <>Every event</>;
  if (events.length === 1) return <span className='font-mono text-xs'>{events[0]}</span>;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className='cursor-default underline decoration-dotted decoration-fg-1 underline-offset-3'>
            {events.length} events
          </span>
        }
      />
      <TooltipContent>
        <span className='flex flex-col gap-0.5 font-mono text-xs'>
          {events.map((event) => (
            <span key={event}>{event}</span>
          ))}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
